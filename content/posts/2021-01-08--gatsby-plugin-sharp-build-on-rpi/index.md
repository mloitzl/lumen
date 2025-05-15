---
title: Gatsby Plugin Sharp not building on Raspberry PI (arm64)
date: "2021-01-08T22:40:32.169Z"
template: "post"
draft: false
slug: "/posts/gatsby-plugin-sharp-not-building-on-raspberry-pi-64"
category: "rpi"
tags:
  - "kubernetes"
  - "development"
  - "gatsby"
  - "docker"
  - "rpi"
description: "The gatsby plugin for 'sharp' depends on Libvips and for some reason the `Dockerfile.production` from gatsby-starter-lumen does not build on my Raspberry Pi 4."
socialImage: "./image.jpg"
---

The gatsby plugin Sharp depends on [Libvips](https://libvips.github.io/libvips/install.html) and for some reason the `Dockerfile.production` from [gatsby-starter-lumen](https://www.gatsbyjs.com/starters/alxshelepenok/gatsby-starter-lumen) it does not build on my Raspberry Pi 4.


```c
make: Entering directory '/usr/src/app/node_modules/sharp/build'
  CC(target) Release/obj.target/nothing/../node-addon-api/nothing.o
  AR(target) Release/obj.target/../node-addon-api/nothing.a
  COPY Release/nothing.a
  TOUCH Release/obj.target/libvips-cpp.stamp
  CXX(target) Release/obj.target/sharp/src/common.o
../src/common.cc:24:10: fatal error: vips/vips8: No such file or directory
   24 | #include <vips/vips8>
      |          ^~~~~~~~~~~~
compilation terminated.
make: *** [sharp.target.mk:137: Release/obj.target/sharp/src/common.o] Error 1
make: Leaving directory '/usr/src/app/node_modules/sharp/build'

```

I am pretty shure, that there are other ways, but adding a global package `vips-dev` solved the problem:

```docker
RUN apk add --update --no-cache --repository http://dl-3.alpinelinux.org/alpine/edge/community --repository http://dl-3.alpinelinux.org/alpine/edge/main vips-dev
```

The build takes very long (44 minutes), since literally everthing is compiled from scratch.

But this can be improved by using Docker caching or probably a base image.

More to come!