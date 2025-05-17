---
title: Setting up a four times redundant gluster volume with mini USB sticks
date: "2021-01-28T22:40:32.169Z"
template: "post"
draft: false
slug: "/posts/setting-up-a-four-times-redundant-gluster-with-mini-usb-sticks"
category: "kubernetes"
tags:
  - "kubernetes"
  - "deployment"
  - "rpi"
description: "What I really need is a super redundant storage cluster on my Pi cluster using plain USB sticks."
socialImage: "./VerbatimUSB30.png"
---

![4 USB Sticks, one for each node](./VerbatimUSB30.png)

What I really really need is a super redundant storage cluster on my Pi cluster using plain USB sticks.

This might sound a little bit over-engineered, but having a [Gluster](https://www.gluster.org/) with 4 USB sticks - one for each Raspberry - allows to run the Cluster with some nodes switched off to safe some energy.

The architecture is as simple as this: Gluster - Heketi Provisioner - Kubernetes Storage Class

The first step (this article) is to create the storage cluster using USB sticks.

This is pretty straight forward and completely based on other blog articles cited at the end.


## Setup the Gluster Server

Install the ```glusterfs-server``` package on each node

```bash
$ sudo apt-get install glusterfs-server
```

Host file entries allow all nodes to find each other

```bash
$ sudo nano /etc/hosts

192.168.1.60    gluster0
192.168.1.61    gluster1
192.168.1.62    gluster2
192.168.1.63    gluster3

```

Check if ```glusterd.service``` has been correctly set-up ...

```bash
$ sudo systemctl status glusterd.service
● glusterd.service - GlusterFS, a clustered file-system server
   Loaded: loaded (/lib/systemd/system/glusterd.service; disabled; vendor preset: enabled)
   Active: inactive (dead)
     Docs: man:glusterd(8)
```

... then start and enable the service on each node.

```bash
$ sudo systemctl start glusterd.service
$ sudo systemctl enable glusterd.service
```

Now probe the nodes

```bash
$ sudo gluster peer probe gluster1
peer probe: success.

$ sudo gluster peer status
Number of Peers: 3

Hostname: 192.168.1.61
Uuid: e34e779c-f0f4-453b-bd9f-103654470614
State: Peer in Cluster (Connected)
Other names:
gluster1

Hostname: gluster2
Uuid: cc244b01-1884-4d2d-a213-29f283f3067a
State: Peer in Cluster (Connected)

Hostname: gluster3
Uuid: a2faf317-47bb-414b-9a87-7e2240b210cd
State: Peer in Cluster (Connected)
```

## Prepare the USB Sticks

The USB sticks need to be formatted for Gluster. First list all block devices with ```lsblk``` and be sure to pick the right one

```bash
$ lsblk
NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda           8:0    1 57.6G  0 disk
`-sda1        8:1    1 57.6G  0 part
mmcblk0     179:0    0 29.8G  0 disk
|-mmcblk0p1 179:1    0  256M  0 part /boot
`-mmcblk0p2 179:2    0 29.6G  0 part /
```

Run the following commands to partition the USB sticks

```bash
$ sudo fdisk -w auto /dev/sda

Welcome to fdisk (util-linux 2.33.1).
Changes will remain in memory only, until you decide to write them.
Be careful before using the write command.


Command (m for help): g
Created a new GPT disklabel (GUID: 0F840961-BAB8-064B-ABFE-C02CA2D346A0).
The old dos signature will be removed by a write command.

Command (m for help): n
Partition number (1-128, default 1):
First sector (2048-120831966, default 2048):
Last sector, +/-sectors or +/-size{K,M,G,T,P} (2048-120831966, default 120831966):

Created a new partition 1 of type 'Linux filesystem' and of size 57.6 GiB.

Command (m for help): w
The partition table has been altered.
Calling ioctl() to re-read partition table.
Syncing disks.
```

The newly created partition can then be formatted with the XFS filesystem

```bash
$ sudo mkfs.xfs -f -L glstrbrck0 /dev/sda1
meta-data=/dev/sda1              isize=512    agcount=4, agsize=3775935 blks
         =                       sectsz=512   attr=2, projid32bit=1
         =                       crc=1        finobt=1, sparse=1, rmapbt=0
         =                       reflink=0
data     =                       bsize=4096   blocks=15103739, imaxpct=25
         =                       sunit=0      swidth=0 blks
naming   =version 2              bsize=4096   ascii-ci=0, ftype=1
log      =internal log           bsize=4096   blocks=7374, version=2
         =                       sectsz=512   sunit=0 blks, lazy-count=1
realtime =none                   extsz=4096   blocks=0, rtextents=0
```

Create the mountpoint

```bash
$ sudo mkdir -p /data/glusterfs/glstrbrck/0
```

Determine the partition UUID and write it to the fstab so that its get mounted automatically when booting


```bash
$ printf $(sudo blkid -o export /dev/sda1|grep PARTUUID)" /data/glusterfs/glstrbrck/0 xfs defaults,noatime 1 2\n" | sudo tee -a /etc/fstab
```

And mount (or reboot)

```bash
$ sudo mount /data/glusterfs/glstrbrck/0
```

The `-o`flag of `lsblk` can be used show the details of the newly created partition:

```bash
$ lsblk -o name,size,type,fstype,mountpoint,label
NAME         SIZE TYPE FSTYPE MOUNTPOINT                  LABEL
sda         57.6G disk                                    
`-sda1      57.6G part xfs    /data/glusterfs/glstrbrck/0 glstrbrck0
mmcblk0     29.8G disk                                    
|-mmcblk0p1  256M part vfat   /boot                       boot
`-mmcblk0p2 29.6G part ext4   /                           rootfs
```

<center>All right so far</center>

## Create the Gluster Volume

After performing the steps on all nodes, a new Gluster Volume can be created - with 4 replicas in my case.

```bash
$ sudo gluster volume create glustervol0 replica 4 gluster0:/data/glusterfs/glstrbrck/0/brick gluster1:/data/glusterfs/glstrbrck/0/brick gluster2:/data/glusterfs/glstrbrck/0/brick gluster3:/data/glusterfs/glstrbrck/0/brick

$ sudo gluster volume start glustervol0
```

Lets check the results:
- List the Volumes...

```bash
$ sudo gluster volume list
glustervol0
```

- ... and display volume details

```bash
$ sudo gluster volume info glustervol0
 
Volume Name: glustervol0
Type: Replicate       # <- A replicated volume
Volume ID: 066c49bb-9c6b-48b0-8f4a-2e9c72e1aa40
Status: Started
Snapshot Count: 0
Number of Bricks: 1 x 4 = 4
Transport-type: tcp
Bricks:
Brick1: gluster0:/data/glusterfs/glstrbrck/0/brick  # <- 4 bricks
Brick2: gluster1:/data/glusterfs/glstrbrck/0/brick
Brick3: gluster2:/data/glusterfs/glstrbrck/0/brick
Brick4: gluster3:/data/glusterfs/glstrbrck/0/brick
Options Reconfigured:
transport.address-family: inet
nfs.disable: on
performance.client-io-threads: off
```
<center>😎 - Awesome</center>

## Some Tests

Mount the the gluster volume on one of the nodes:


```bash
$ sudo mkdir /storage-pool
$ sudo mount -t glusterfs gluster0:/glustervol0 /storage-pool
```

Create some files

```bash
$ cd /storage-pool/
$ sudo touch file_{0..9}.test
```

Mount the gluster volume on another host, and check the result.

```bash
$ sudo mount -t glusterfs gluster1:/glustervol0 /storage-pool
$ cd /storage-pool
$ ls

storage-pool $ ls -la

drwxr-xr-x  3 root root 4096 Jan 25 16:47 .
drwxr-xr-x 23 root root 4096 Jan 17 17:52 ..
-rw-r--r--  1 root root    0 Jan 17 17:53 file_0.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_1.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_2.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_3.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_4.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_5.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_6.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_7.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_8.test
-rw-r--r--  1 root root    0 Jan 17 17:53 file_9.test
```

That works!


## Performance

Now lets check the performance...


### Writing random data

```bash
$ sudo dd if=/dev/urandom of=/storage-pool/file1.rnd count=65536 bs=1024

65536+0 records in
65536+0 records out
67108864 bytes (67 MB, 64 MiB) copied, 14.5248 s, 4.6 MB/s
```

... increasing the block size helps.

```bash
sudo dd if=/dev/urandom of=/storage-pool/file2.rnd count=512 bs=131072

512+0 records in
512+0 records out
67108864 bytes (67 MB, 64 MiB) copied, 2.37264 s, 28.3 MB/s
```

Whats actually the read speed of urandom?


```bash
$ dd if=/dev/urandom of=/dev/null count=65536 bs=1024

65536+0 records in
65536+0 records out
67108864 bytes (67 MB, 64 MiB) copied, 1.32923 s, 50.5 MB/s
```

Pretty nice for an embedded device.

### Reading data

Read a file... 

```bash
$ dd if=/storage-pool/file2.rnd of=/dev/null bs=131072
512+0 records in
512+0 records out
67108864 bytes (67 MB, 64 MiB) copied, 0.595213 s, 113 MB/s
```

... and read the file a second time reveals the caching performance.

```bash
$ dd if=/storage-pool/file2.rnd of=/dev/null bs=131072
512+0 records in
512+0 records out
67108864 bytes (67 MB, 64 MiB) copied, 0.0385229 s, 1.7 GB/s
```

Setting up a 4 times redundant storage array with Gluster went pretty straight forward due to the follwing awesome articles:

- [Building a Raspberry Pi storage cluster to run Big Data tools at home](https://godatadriven.com/blog/building-a-raspberry-pi-storage-cluster-to-run-big-data-tools-at-home/)
- [GlusterFS on ARM](https://www.gopeedesignstudio.com/2018/07/13/glusterfs-on-arm/)
- [How To Create a Redundant Storage Pool Using GlusterFS on Ubuntu 18.04](https://www.digitalocean.com/community/tutorials/how-to-create-a-redundant-storage-pool-using-glusterfs-on-ubuntu-18-04#step-4-—-creating-a-storage-volume)


# Related

- [Portable Kubernetes Cluster based on Raspberry Pi 4 and Rancher K3S](/posts/portable-kubernetes-cluster-Raspberry4-rancher-k3s/)
- [Setup mini Kubernetes Rancher K3S on Raspberry OS Lite](/posts/setup-k3s-on-raspberryos-lite/)
- Storage class and nfs provisioner
- [Setting up a four times redundant gluster volume with mini USB sticks](/posts/setting-up-a-four-times-redundant-gluster-with-mini-usb-sticks/) (this)
- Automatically provision Gluster volumes with Heketi