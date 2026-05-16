---
title: "Lose a Node, Keep the Service: Building a Zero-Downtime 3-Node k3s Cluster"
date: "2026-05-16T15:00:00.000Z"
template: "post"
draft: false
slug: "/posts/lose-a-node-keep-the-service-zero-downtime-k3s-cluster"
category: "infrastructure"
tags:
  - kubernetes
  - k3s
  - mongodb
  - typesense
  - homelab
description: "How to build a 3-node k3s cluster where losing any single node — hardware failure, OS panic, accidental power cut — causes zero application downtime."
---

There's a specific kind of peace that comes from watching a node go dark and seeing your application not even flinch.

No alerts. No 500s. No panicked SSH sessions. Just a quiet log line somewhere saying a pod rescheduled, and life goes on.

This post is about building exactly that: a 3-node [k3s](https://k3s.io/) cluster running [VinylVault](https://github.com/mloitzl/vinyl-vault) — a full-stack app backed by a **MongoDB replica set**, a **Typesense Raft cluster**, and stateless Node.js services — where losing any single node is a non-event.

The hardware is three Raspberry Pi 5s. The principles apply to any multi-node k3s setup.

---

## The Threat Model

"High availability" gets thrown around loosely. Let's be concrete. Our goal is:

> **Losing any one of three nodes — permanently or temporarily — must not cause application downtime.**

That means every layer of the stack needs to survive a 1-of-3 failure:

| Layer | Technology | Survival mechanism |
|---|---|---|
| Control plane | k3s + embedded etcd | Raft quorum: 2/3 nodes |
| Storage | Longhorn | 3-replica volumes |
| Search index | Typesense | Raft cluster: 3 nodes |
| Database | MongoDB | Replica set: 1 primary + 2 secondaries |
| App pods | Deployment + HPA | Topology spread: 1 pod per node |

Every layer uses the same fundamental idea: **you need at least 2 surviving nodes to maintain quorum or keep a replica running**. With 3 total nodes, losing 1 always leaves 2. That's your margin.

---

## Layer 1: k3s Control Plane with etcd

k3s ships with embedded etcd. In a 3-node server setup, all three nodes form an etcd cluster. Etcd requires `⌊N/2⌋ + 1 = 2` nodes for quorum, so losing 1 of 3 is fine.

The critical detail is the **stable control-plane endpoint**. If your API server address is a node IP and that node dies, `kubectl` breaks and new pods can't register. You need a VIP.

We use [kube-vip](https://kube-vip.io/) in ARP mode. It runs as a DaemonSet on control-plane nodes and floats a virtual IP across whichever node is currently active:

```bash
# kube-vip manifest injected into /var/lib/rancher/k3s/server/manifests/
# VIP: 192.168.1.50 — DNS: cloudforge1-api → 192.168.1.50
```

The k3s join command on all nodes always points at the VIP, never at a node IP:

```bash
K3S_URL=https://cloudforge1-api:6443
```

When a control-plane node fails, kube-vip re-elects and the VIP migrates. The API stays reachable. New pods can still be scheduled. The cluster continues.

---

## Layer 2: Distributed Storage with Longhorn

Stateful services need persistent volumes. On a single node, a PVC is just a local directory. That's fine until that node dies and the pod reschedules somewhere else — then the data is gone.

[Longhorn](https://longhorn.io/) solves this by replicating volumes across nodes. With `defaultReplicaCount: 3`, every PVC gets 3 replicas spread across your 3 nodes. The pod can reschedule to any surviving node and Longhorn will attach the volume there.

```yaml
# gitops/clusters/homelab/platform/longhorn/helmrelease.yaml
values:
  defaultSettings:
    defaultReplicaCount: 3
```

A subtle catch: **`defaultReplicaCount` only applies to new PVCs**. Existing volumes keep their original replica count. If you started on a single node and then scaled to 3, you need to patch old volumes manually:

```bash
kubectl patch volume <pvc-name> -n longhorn-system \
  --type=merge -p '{"spec":{"numberOfReplicas":3}}'
```

---

## Layer 3: MongoDB Replica Set

MongoDB's replica set protocol is built for exactly this scenario. A 3-member set (1 primary, 2 secondaries) requires 2 nodes for election quorum. Lose 1 secondary: still have a primary. Lose the primary: the 2 remaining members elect a new one in seconds.

The non-obvious part is **how you configure the member hostnames**. This tripped us up.

When MongoDB joins a replica set, it registers each member's host address and uses it for inter-member replication. If you initialize the set pointing member 0 at a Kubernetes `ClusterIP` service:

```js
rs.initiate({ members: [{ _id: 0, host: "mongodb:27017" }] })
```

...you've made a trap. The `mongodb` ClusterIP will eventually load-balance across all 3 pods — including pods that are themselves in `STARTUP` state. When a new secondary tries to sync, it picks the ClusterIP as its source and randomly hits a non-primary. Sync fails, pod crashes, crashes loop.

**Always use StatefulSet headless DNS for RS members:**

```js
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb-0.mongodb-headless.vinylvault.svc.cluster.local:27017" },
    { _id: 1, host: "mongodb-1.mongodb-headless.vinylvault.svc.cluster.local:27017" },
    { _id: 2, host: "mongodb-2.mongodb-headless.vinylvault.svc.cluster.local:27017" },
  ]
})
```

With headless DNS, each `mongodb-{N}` name resolves directly to the pod's IP. No load balancing. Replication always goes to the right pod.

We wrap this in a Kubernetes `Job` that runs on each fresh deploy. The init container waits until all 3 headless DNS names resolve before the main container runs `rs.initiate()` — making the job idempotent and crash-safe:

```bash
# init container: wait for all 3 members to be reachable
for host in mongodb-0.mongodb-headless mongodb-1.mongodb-headless mongodb-2.mongodb-headless; do
  until nc -z ${host}.${NAMESPACE}.svc.cluster.local 27017; do sleep 2; done
done
```

---

## Layer 4: Typesense Raft Cluster

[Typesense](https://typesense.org/) uses Raft for its internal cluster consensus. Like etcd and MongoDB, a 3-node cluster tolerates 1 failure.

The setup follows the same headless DNS pattern: each Typesense node needs to know the stable addresses of its peers at startup. We use an init container that resolves the headless DNS names and writes a `nodes` file:

```
mongodb-0.typesense-headless.vinylvault.svc.cluster.local:8107:8108,
mongodb-1.typesense-headless.vinylvault.svc.cluster.local:8107:8108,
mongodb-2.typesense-headless.vinylvault.svc.cluster.local:8107:8108
```

One thing that makes Typesense tricky in Kubernetes: pod IPs change on reschedule, but Typesense embeds peer addresses in its Raft log. To handle this gracefully, we run a **`nodes-updater` sidecar** that rewrites the nodes file every 20 seconds:

```yaml
- name: nodes-updater
  image: alpine
  command: ["/bin/sh", "-c"]
  args:
    - |
      while true; do
        # resolve current IPs for all peers and rewrite /data/nodes
        ...
        sleep 20
      done
```

This means Typesense always has fresh peer addresses without needing a full restart after a pod reschedule.

---

## Layer 5: Stateless Pods — the Topology Spread Trap

MongoDB and Typesense handle their own resilience. Stateless pods (backend API, BFF, frontend) need a different approach: just make sure there's always at least one replica on a surviving node.

The naive solution — `replicas: 2` — is not enough. Without placement constraints, Kubernetes might schedule both pods on the same node. Lose that node, lose both pods.

The fix is `topologySpreadConstraints` with `whenUnsatisfiable: DoNotSchedule`:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector: {}
    matchLabelKeys:
      - app
```

`DoNotSchedule` is the key word. `ScheduleAnyway` (the default) is a hint — the scheduler *tries* to spread, but will stack pods on one node if it's under pressure. `DoNotSchedule` is a hard rule: if spreading is impossible, the pod stays `Pending`. That's the guarantee we want.

Pair this with `minReplicas: 2` in the HPA:

```yaml
# infra/k8s/overlays/homelab/kustomization.yaml
- target:
    kind: HorizontalPodAutoscaler
  patch: |-
    - op: replace
      path: /spec/minReplicas
      value: 2
    - op: replace
      path: /spec/maxReplicas
      value: 3  # HPA can scale to fill all 3 nodes under load
```

With 3 nodes and 2 replicas, the topology constraint places 1 pod on 2 different nodes. Lose either node: 1 replica survives, HPA immediately targets 2, a new pod schedules on the now-empty third node.

**One gotcha with rolling updates:** during a rolling update, the scheduler sees terminating old pods as "still occupying" their node. New pods can temporarily stack on the same node before the old ones finish terminating. After every topology-changing deployment, a `kubectl rollout restart` re-spreads the pods cleanly.

---

## What Surviving Node Loss Actually Looks Like

With all layers in place, this is what happens when a node goes down:

1. **etcd** detects the node is unreachable and marks it unhealthy. The remaining 2 nodes maintain quorum.
2. **kube-vip** (if the downed node held the VIP) re-elects and migrates the VIP to a healthy node within ~2 seconds. `kubectl` keeps working.
3. **Longhorn** rebuilds volume replicas on the surviving nodes. The volume remains accessible throughout.
4. **MongoDB** — if the failed node held a secondary, the replica set continues with the surviving primary + secondary. If it held the primary, an election completes in 10–30 seconds, a new primary is elected, and writes resume.
5. **Typesense** — same as MongoDB. 2/3 nodes maintain Raft quorum.
6. **Stateless pods** — the scheduler detects the node is `NotReady`, evicts pods after `tolerationSeconds` (default 300s for `node.kubernetes.io/not-ready`). With topology spread, the surviving node already has a replica running and serving traffic throughout.

The only visible impact: if the pod on the downed node was handling an in-flight request, that request fails. The next request goes to the surviving replica. For most workloads, that's not "downtime" — it's a retry.

---

## The Numbers

| Scenario | MongoDB | Typesense | Stateless |
|---|---|---|---|
| Node 1 down | RS: 1P + 1S ✅ | Raft: 2/3 ✅ | 1 replica survives ✅ |
| Node 2 down | RS: 1P + 1S ✅ | Raft: 2/3 ✅ | 1 replica survives ✅ |
| Node 3 down | RS: 1P + 1S ✅ | Raft: 2/3 ✅ | 1 replica survives ✅ |
| 2 nodes down | RS: no quorum ❌ | Raft: no quorum ❌ | 0 replicas ❌ |

You can lose any one. You can't lose two. That's the deal with N=3.

---

## Is This Overkill for a Homelab?

Maybe. But "homelab" doesn't mean "I don't care about uptime." It means I'm learning on my own hardware with my own time. And the thing I've learned most clearly from this project is that resilience doesn't come from hope — it comes from explicit, testable configuration.

Every piece of this setup is reproducible from a fresh flash of three 1 TB NVMe SSDs. Plug in a node, watch it join, watch Flux reconcile, watch the replica count go up. It's infrastructure as a first-class concern.

The Raspberry Pi 5s run k3s. The code runs in Git. The cluster runs itself.

---

The full setup lives in [cloudforge](https://github.com/mloitzl/cloudforge) (the GitOps infra repo) and [vinyl-vault](https://github.com/mloitzl/vinyl-vault) (the app).

---

*VinylVault is a personal record collection manager and architecture sandbox. Read more about the application layer in [The Greenfield Sandbox](/posts/implementing-hard-tenant-isolation-and-deterministic-data-at-scale).*
