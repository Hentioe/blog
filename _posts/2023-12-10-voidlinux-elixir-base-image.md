---
title: 让 Void Linux 成为 Elixir 应用的基础镜像
date: 2023-12-08 +0800
categories: [技术, Linux]
tags: [Void Linux, Elixir, Docker]     # TAG names should always be lowercase
---

## 前言

Void Linux 是一个忍不住想关注的发行版，它既可以较为精小，又可以相对膨胀。它同时维护 glibc 和 musl 两个不同 C 库的版本，又发布有内置 BusyBox 和 GNU Coreutils 两个不同工具集的版本。

毫无疑问，将 glibc/BusyBox 版本作为基础容器是非常合适的。例如我已将其用作 Elixir 应用的基础，且效果不错。它比 Debian 更小巧，软件包也新得多。至少对我而言 `-void` 已经成为了 `-slim` 的良好替代品。

>此处提及的 `-slim` 是常见的以 Debian 为基础的镜像标签名后缀风格，不具有强相关性。
{: .prompt-warning }

_如果有机会我会进一步介绍 Void Linux，但不是本文的重点。_

## 选型

选择 Void Linux 的具体原因：

1. 它发布有 BusyBox 的版本，相比 Coreutils 体积小得多。对于容器环境 Coreutils 显得多余了。（BusyBox 常见于嵌入式 Linux，十分精小）。
1. 它发布有基于 glibc 的 BusyBox 版本，而 Alpine 这种同用 BusyBox 的发行版基于 musl。当我们的应用在常规环境开发测试时，glibc 永远是 Tier 1 的可靠性。musl 可以作为精小的特供版本，不应该成为唯一的目标。
1. 它的包非常新，可以避免时长要从源码构建依赖库的麻烦（或者说避免使用老旧的充满漏洞的库）。

所以我说 Void Linux 十分适合作为容器环境。它在可靠性和体积方面比较平衡，介于 Alpine 和 Debian 之间。

### 谨慎选择

本文无意图干扰任何人的技术选型，包括 Docker 基础镜像的选择。实际上我并不建议阅读本文的人跟随我做同样的选择，因为 Void Linux 相比 Debian 并不是一个足够成熟的发行版，且各个方面都可能存在差异。

如果你没有丰富的 Linux 使用经验和很强的问题排查能力，我绝不建议你这样做。你应该尽可能的使用官方发布的镜像。但你仍然可以尝试本文的内容，不用于生产。

## 例子

我使用 Void Linux 制作的 Erlang 和 Elixir 镜像，相比 Debian 的镜像体积减小了大约 `60MBM`。

这是具体的镜像例子：

| 镜像名称 | 镜像标签 | 镜像体积 |
|:---|:---:|:---|
| [`erlang`](https://hub.docker.com/layers/library/erlang/26.2-slim/images/sha256-dcc8ea63dbb310073369e1d08fc123ec0f9826fe71ee5223b52aa2abafa43952?context=explore) | 26.2-slim | 117.28 MB |
| [`hentioe/erlang`](https://hub.docker.com/layers/hentioe/erlang/26.2-void/images/sha256-63756aa8f66517866146afa207054e819c5f17d5f6516939fc86566d13d46dba?context=explore) | 26.2-void | 56.1 MB |
| [`elixir`](https://hub.docker.com/layers/library/elixir/1.15.7-slim/images/sha256-df24832e2b9d89b58ca5b2dd0945f4b2b22abf9f8be0a8ea4f610bb940fe6a9e?context=explore) | 1.15.7-slim | 123.8 MB |
| [`hentioe/elixir`](https://hub.docker.com/layers/hentioe/elixir/1.16-otp-26-void/images/sha256-f5ef811c03f86beb07ab08ca71459573ced0284dac2c26cd8f0bab024cc067e0?context=explore) | 1.16-otp-26-void | 62.6 MB |

它们相比基于 Alpine 的镜像，大了约 `10MB`。我认为基本上已经把体积控制到了极限。体积的极限压缩是我在数次尝试优化的过程中逐步加深了对 Void Linux 的了解，所达到的结果。它并非主要目的。

>体积并不是最重要的。具有 Docker 镜像常识的都应该知道镜像是一层层的，只要基础镜像不变化镜像的总体积并不表示更新时所下载的大小。
{: .prompt-info }

## 过程

想用 Void Linux 环境打包 Elixir 应用，需要从 `Erlang -> Elixir -> App` 这三个步骤先后构建镜像。这个过程对于要高度掌控底层的人来说是很有必要的，尤其是我这种不信任官方镜像维护者的人。

>Docker 官方 Elixir 镜像的维护者动作很慢，Erlang 版本不详，且无任何测试。在我看来是不可靠的。不过我也不建议任何阅读本文的人信任我，我只对自己负责的项目提供支持。
{: .prompt-warning }

### 构建 Erlang 镜像

Erlang 相对来说问题是最少的，通过 `buildx` 命令可轻易构建出多 `arch` 的镜像。从[这里](https://hub.docker.com/r/hentioe/erlang/tags)查看我发布的镜像，同时提供 `amd64` 和 `arm64`。它们是由我的 CI 服务器构建并推送的。我永远会第一时间更新最新的版本，包括 RC。

这是一个例子：

```Dockerfile
FROM ghcr.io/void-linux/void-glibc-busybox:20231202R1

COPY cleanup.sh /usr/bin/void-cleanup

ENV OTP_VERSION="26.2.1" \
    # Declare runtime dependencies. \
    RUNTIME_DEPS=' \
    libstdc++ \
    libssl3 \
    lksctp-tools \
    ncurses-libs \
    '

LABEL org.opencontainers.image.version=$OTP_VERSION

RUN set -xe \
    && OTP_DOWNLOAD_URL="https://github.com/erlang/otp/archive/OTP-${OTP_VERSION}.tar.gz" \
    && OTP_DOWNLOAD_SHA256="d99eab3af908b41dd4d7df38f0b02a447579326dd6604f641bbe9f2789b5656b" \
    && fetchDeps=' \
    curl' \
    && xbps-install -Sy \
    && xbps-install -Ay $fetchDeps \
    && curl -fSL -o otp-src.tar.gz "$OTP_DOWNLOAD_URL" \
    && echo "$OTP_DOWNLOAD_SHA256  otp-src.tar.gz" | sha256sum -c - \
    && buildDeps=' \
    autoconf \
    dpkg \
    gcc \
    make \
    ncurses-devel \
    openssl-devel \
    lksctp-tools-devel \
    pax-utils \
    binutils \
    ' \
    && xbps-install -Ay $buildDeps \
    && export ERL_TOP="/usr/src/otp_src_${OTP_VERSION%%@*}" \
    && mkdir -vp $ERL_TOP \
    && tar -xzf otp-src.tar.gz -C $ERL_TOP --strip-components=1 \
    && ( cd $ERL_TOP \
    && ./otp_build autoconf \
    && gnuArch="$(dpkg-architecture --query DEB_HOST_GNU_TYPE)" \
    && ./configure --build="$gnuArch" \
    && make -j$(getconf _NPROCESSORS_ONLN) \
    && make install ) \
    # Clean up \
    && find /usr/local -regex '/usr/local/lib/erlang/\(lib/\|erts-\).*/\(man\|doc\|obj\|c_src\|emacs\|info\|examples\)' | xargs rm -rf \
    && find /usr/local -name src | xargs -r find | grep -v '\.hrl$' | xargs rm -v || true \
    && find /usr/local -name src | xargs -r find | xargs rmdir -vp || true \
    && scanelf --nobanner -E ET_EXEC -BF '%F' --recursive /usr/local | xargs -r strip --strip-all \
    && scanelf --nobanner -E ET_DYN -BF '%F' --recursive /usr/local | xargs -r strip --strip-unneeded \
    && xbps-remove -Roy $buildDeps $fetchDeps \
    # Install runtime dependencies (must be done after cleaning build dependencies). \
    && xbps-install -y $RUNTIME_DEPS \ 
    && rm -rf otp-src.tar.gz $ERL_TOP \
    && void-cleanup

CMD ["erl"]
```

为了尽可能小巧，它会删除文档、源码、示例等文件，并用 `strip` 删除了二进制文件的调试信息。

你可能注意到此 `Dockerfile` 最终执行了一个看起来用于清理的脚本（`void-cleanup`），它在一开始被复制进去。这是我故意内置的，便于执行清理 `xbps` 缓存。它是这个样子的：

```sh
#!/usr/bin/env sh

echo "Clearing xbps cache..."
rm -rf /var/cache/xbps/*

echo "Clearing xbps repository..."
find /var/db/xbps/ -type d -name "https___repo-*" -exec rm -rf {} +
```

以上都是值得说明的，但真正值得注意和学习的，其实是 `xbps-install -A` 命令。

如果没有 `-A` 这个命令行选项，`xbpx-remove -Ro` 也不一定总能在复杂的依赖树中找出全部可以移除的孤立包。这会导致镜像体积膨胀，因为多余的构建时依赖包被保留。即使是其它包管理系统，为了打包出最小的镜像体积，你也不得不留意这方面。

>如果 `-A` 选项仍无法避免构建时的依赖包残留，你可以尝试用同样的包列表二次执行 `xbpx-remove -Ro` 命令。
{: .prompt-info }

### 构建 Elixir 镜像

构建 Elixir 镜像会麻烦一些，因为编译 Elixir 期间会触发一个 BUG。此 BUG 背后的原理很难简单说清楚，它跟 Erlang 运行时的 JIT 默认使用的「双内存映射」机制有关，只发生于 QEMU 的虚拟机中。当我们用 `buildx` 命令构建其它架构的镜像时，Docker 会在背后创建 QEMU 虚拟机来完成。

从[这里](https://hub.docker.com/r/hentioe/elixir/tags)查看我发布的镜像，同时提供 `amd64` 和 `arm64`（不同的架构刻意做了标签名区分）。它们是由我的 CI 服务器构建并推送的。我永远会第一时间更新最新的版本，包括 RC。

例子：

```Dockerfile
FROM hentioe/erlang:26.2.1-void

ARG TARGETARCH

ENV ELIXIR_VERSION="v1.16.0-rc.1" \
    # elixir expects utf8. \
    LANG=C.UTF-8 \
    # Declare runtime dependencies. \
    RUNTIME_DEPS=' \
    libstdc++ \
    libssl3 \
    lksctp-tools \
    ncurses-libs \
    '

RUN set -xe \
    && if [ "$TARGETARCH" = "arm64" ]; then \
    # Avoid QEMU/arm64 build failed. \
    export ERL_FLAGS="+JMsingle true"; \
    fi \
    && ELIXIR_DOWNLOAD_URL="https://github.com/elixir-lang/elixir/archive/${ELIXIR_VERSION}.tar.gz" \
    && ELIXIR_DOWNLOAD_SHA256="057aca982fd840f2e01c2d60e51523d6870e6937bea58f0e0860d118b7ca2de4" \
    && buildDeps=' \
    curl \
    make \
    glibc-locales \
    ' \
    && xbps-install -Sy \
    && xbps-install -Ay $buildDeps \
    # Set locale to C.UTF-8 \
    && sed -i 's/^#C.UTF-8/C.UTF-8/' /etc/default/libc-locales \
    && xbps-reconfigure -f glibc-locales \
    # Build and install Elixir \
    && curl -fSL -o elixir-src.tar.gz $ELIXIR_DOWNLOAD_URL \
    && echo "$ELIXIR_DOWNLOAD_SHA256  elixir-src.tar.gz" | sha256sum -c - \
    && mkdir -p /usr/local/src/elixir \
    && tar -xzC /usr/local/src/elixir --strip-components=1 -f elixir-src.tar.gz \
    && ( cd /usr/local/src/elixir \
    && make install clean ) \
    # Clean up \
    && find /usr/local/src/elixir/ -type f -not -regex "/usr/local/src/elixir/lib/[^\/]*/lib.*" -exec rm -rf {} + \
    && find /usr/local/src/elixir/ -type d -depth -empty -delete \
    && xbps-remove -Roy $buildDeps \
    && rm elixir-src.tar.gz \
    # Install runtime dependencies (must be done after cleaning build dependencies). \
    && xbps-install -y $RUNTIME_DEPS \
    # Clean up Void Linux environment. \
    && void-cleanup

CMD ["iex"]
```

我们根据目标架构动态设置了 `ERL_FLAGS` 变量的值，此变量是为避免 `buildx` 构建多架构失败的刻意为之，否则并不需要它（或者说不用设置它）。当我们为其它的 `arch` （例如 `arm64`）构建镜像时，必须将此变量设置为 `+JMsingle true` 以避免相关 BUG 发生。

需要注意的是 `+JMsingle true` 是 Erlang/OTP 26 新增的 flag，如果在 26 以下版本可使用 `+JPperf true`。如果传递后者，还需要在 `Dockerfile` 末尾的清理步骤中删除 `/tmp/jit-*.dump` 和 `/tmp/perf-*.map` 两类文件，避免镜像体积膨胀。

>为什么 `ERL_FLAGS` 变量不设置在 `ENV` 指令中呢？通过读取 `ARG` 的值也可以动态设置。实际上在早期我就是这么做的，但我后来意识到这是一个错误。这导致任何运行环境都会关掉 JIT 的双内存映射，这是不必要的。因为这个 BUG 几乎只会出现在 Docker 多架构镜像的构建中。
{: .prompt-warning }

### 构建 App 镜像

这是一个例子：

```Dockerfile
# 使用基于 Void Linux 的 Elixir 镜像构建。
FROM hentioe/elixir:1.16.0-rc.0-otp-26-void as build

ENV MIX_ENV=prod

WORKDIR /src

COPY . /src/

RUN mix deps.get && mix compile && mix release


# 使用 Void Linux 原始镜像打包。
FROM ghcr.io/void-linux/void-glibc-busybox:20231202R1

RUN set -xe \
    && runtimeDeps=' \
    libstdc++ \
    libssl3 \
    lksctp-tools \
    ncurses-libs \
    ' \
    && buildDeps='glibc-locales' \
    && xbps-install -SAy $buildDeps \
    # Enable C.UTF-8 locale. \
    && sed -i 's/^#C.UTF-8/C.UTF-8/' /etc/default/libc-locales \
    && xbps-reconfigure -f glibc-locales \
    && xbps-remove -Roy $buildDeps \
    && xbps-install -y $runtimeDeps \
    # Clear xbps cache. \
    && rm -rf /var/cache/xbps/* \
    # Clearing xbps repository. \
    && find /var/db/xbps/ -type d -name "https___repo-*" -exec rm -rf {} +

ARG APP_HOME=/home/app_name

COPY --from=build /src/_build/prod/rel/app_name $APP_HOME

WORKDIR $APP_HOME

ENV LANG=C.UTF-8
ENV PATH="$APP_HOME/bin:$PATH"

ENTRYPOINT [ "app_name", "start" ]
```

这个 `Dockerfile` 分为了两个阶段：首先用 Elixir 镜像复制源代码并完成编译，后用原生的 Void Linux 镜像进行了打包。

可以发现打包过程略微复杂，并不能简单的 `COPY` 后再安装运行时依赖就制作好。这是因为 Void Linux 比想象中还要原始一些，它甚至没有启用任何 `locales`，默认是 `POSIX`（遇到 CJK 字符会乱码）。我们必须先启用然后重新生成 `locales`。

>本文可能会过时，可参考 [`Hentioe/my-docker-erlang-otp`](https://github.com/Hentioe/my-docker-erlang-otp) 和 [`Hentioe/my-docker-elixir`](https://github.com/Hentioe/my-docker-elixir) 两个仓库。
{: .prompt-info }

## 结束语

到此，使用 Void Linux 打包 Elixir 应用就完成了。如果你的项目足够复杂，可能会扩展到其它语言的生态，此时 Void Linux 就会带来很大的帮助。

我的某些项目集成了 Rust，并使用了一些流行的 C 库（如 ImageMagick）。通过 Void Linux 能轻松安装最新的版本，且镜像体积相比 Deiban 环境缩小了 50% 以上。
