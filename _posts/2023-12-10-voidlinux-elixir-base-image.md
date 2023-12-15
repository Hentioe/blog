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

## 过程

想用 Void Linux 环境打包 Elixir 应用，需要从 `Erlang -> Elixir -> App` 这三个步骤先后构建镜像。这个过程对于要高度掌控底层的人来说是很有必要的，尤其是我这种不信任官方镜像维护者的人。

>Docker 官方 Elixir 镜像的维护者动作很慢，Erlang 版本不详，且无任何测试。在我看来是不可靠的。不过我也不建议任何阅读本文的人信任我，我只对自己负责的项目提供支持。
{: .prompt-warning }

### 构建 Erlang 镜像

Erlang 相对来说问题是最少的，通过 `buildx` 命令可轻易构建出多 `arch` 的镜像。从[这里](https://hub.docker.com/r/hentioe/erlang/tags)查看我发布的镜像，同时提供 `amd64` 和 `arm64`。它们是由我的 CI 服务器构建并推送的。我永远会第一时间更新最新的版本，包括 RC。

这是一个例子：

```Dockerfile
FROM ghcr.io/void-linux/void-glibc-busybox:20231003R1

COPY cleanup.sh /usr/bin/void-cleanup

ENV OTP_VERSION="26.2" \
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
    && OTP_DOWNLOAD_SHA256="25675a40f9953f39440046b5e325cf992b29323b038d147f3533435a2be547e6" \
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

构建 Elixir 镜像会麻烦一些，因为编译 Elixir 期间会触发一个 BUG。此 BUG 背后的原理很难简单说清楚，它跟 Erlang 运行时的 JIT 的性能收集有关，只发生于 QEMU 的虚拟机中。而 `buildx` 命令使用 QEMU 来构建其它架构的镜像。

从[这里](https://hub.docker.com/r/hentioe/elixir/tags)查看我发布的镜像，同时提供 `amd64` 和 `arm64`（不同的架构刻意做了标签名区分）。它们是由我的 CI 服务器构建并推送的。我永远会第一时间更新最新的版本，包括 RC。

例子：

```Dockerfile
FROM hentioe/erlang:26.1.2-void

ARG ERL_FLAGS=""

ENV ELIXIR_VERSION="v1.16.0-rc.0" \
 # set flags from build_arg. \
 ERL_FLAGS=$ERL_FLAGS \
 # elixir expects utf8. \
 LANG=C.UTF-8 

RUN set -xe \
 && ELIXIR_DOWNLOAD_URL="https://github.com/elixir-lang/elixir/archive/${ELIXIR_VERSION}.tar.gz" \
 && ELIXIR_DOWNLOAD_SHA256="2dfbe017ccff1b05cacf80d7204b088ab438ec6ff1311a3bd9d33ceb2c26674e" \
 && buildDeps=' \
 curl \
 make \
 glibc-locales \
 ' \
 && xbps-install -Sy \
 && xbps-install -y $buildDeps \
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
 && xbps-remove -Ry $buildDeps \
 # Install runtime dependencies in the back door to avoid being removed by association. \
 && runtimeDeps=' \
 libstdc++ \
 libssl3 \
 lksctp-tools \
 ncurses-libs \
 ' \
 && xbps-install -y $runtimeDeps \ 
 && rm elixir-src.tar.gz \
 && rm -f /tmp/jit-*.dump /tmp/perf-*.map \
 && void-cleanup

CMD ["iex"]
```

我们从外部接收了一个 `ERL_FLAGS` 参数并作为同名环境变量。这个变量是避免 `buildx` 构建多架构失败的刻意为之，否则并不需要它（或者说不用设置它）。当我们为其它的 `arch` 构建镜像时，必须给此参数传递 `+JPperf true` 以避免相关 BUG 发生。也是由于这个原因，我不得不将不同架构的镜像用各自的标签独立开来。

Erlang/OTP 26 发布以后，多了一个 `+JMsingle` 参数，据说可以避免 QEMU 环境中的运行时崩溃。我目前还未正式调研和测试此参数，有待后续更新此部分。

### 构建 App 镜像

这是一个例子：

```Dockerfile
# 从 ARM64 镜像构建。
FROM hentioe/elixir:1.16.0-rc.0-otp-26-void-arm64 as build

ENV MIX_ENV=prod

WORKDIR /src

COPY . /src/

RUN mix deps.get && mix compile && mix release


# 使用 Void Linux 镜像打包。
FROM ghcr.io/void-linux/void-glibc-busybox:20231003R1

RUN set -xe \
    && runtimeDeps=' \
    libssl3 \
    lksctp-tools \
    ncurses-libs \
    ' \
    && buildDeps='glibc-locales' \
    && xbps-install -Sy $buildDeps \
    # Enable C.UTF-8 locale. \
    && sed -i 's/^#C.UTF-8/C.UTF-8/' /etc/default/libc-locales \
    && xbps-reconfigure -f glibc-locales \
    && xbps-remove -Ry $buildDeps \
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

这个 `Dockerfile` 分为了两个阶段：首先用 Elixir 镜像复制源代码并执行编译命令，然后用原生的 Void Linux 镜像进行了打包。

可以发现打包过程略微复杂，并不能靠简单的 `COPY` 再安装运行时依赖就制作好。这是因为 Void Linux 比想象中还要原始一些，它甚至没有启用任何 `locales`，默认是 `POSIX`（遇到 CJK 字符会乱码）。我们必须先启用然后重新生成 `locales`。

>本文可能会过时，可参考 [`Hentioe/my-docker-erlang-otp`](https://github.com/Hentioe/my-docker-erlang-otp) 和 [`Hentioe/my-docker-elixir`](https://github.com/Hentioe/my-docker-elixir) 两个仓库。
{: .prompt-info }

## 结束语

到此，使用 Void Linux 打包 Elixir 应用就完成了。如果你的项目足够复杂，可能会扩展到其它语言的生态，此时 Void Linux 就会带来很大的帮助。

我的某些项目集成了 Rust，并使用了一些流行的 C 库（如 ImageMagick）。通过 Void Linux 能轻松安装最新的版本，且镜像体积相比 Deiban 环境缩小了 40% 以上。
