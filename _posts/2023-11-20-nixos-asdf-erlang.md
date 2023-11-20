---
title: 在 NixOS 中使用 asdf 管理 Erlang 的多个版本
date: 2023-11-20 22:10:00 +0800
categories: [技术, 编程]
tags: [NixOS, asdf, Erlang]     # TAG names should always be lowercase
---

## 介绍

NixOS 是一个特殊的 Linux 发行版，它不遵循 FHS 以至于你通常不能运行来自第三方的存在动态链接的二进制文件。对于这类预编译的软件，你可以手动修补所有的二进制可执行文件和动态链接库。或者以更加标准可靠的做法：编写 `default.nix` 将它们制作成一个个常规的 Nix 包。

除此之外，还有一种选择，那就是从源代码编译它们。asdf 使用 `kerl` 从源码构建 Erlang，而不是拉取和解压二进制压缩包，这恰好给 NixOS 减少了很多麻烦。

## 编写 shell.nix

通过 `shell.nix` 配置编译环境，就可以正常使用 asdf 安装 Erlang 的任意版本了。

这是 Erlang OTP 24 以上版本的 `shell.nix`:

```nix
with import <nixpkgs> { };

mkShell {
  buildInputs = [
    pkg-config
    gnumake
    autoconf
    ncurses
    openssl
    libxslt
    fop
    libxml2
    libGL
    libGLU
    (wxGTK32.override { withWebKit = true; })
    xorg.libX11
  ];

  shellHook = ''
    export KERL_CONFIGURE_OPTIONS="--with-ssl=${
      lib.getOutput "out" openssl
    } --with-ssl-incl=${lib.getDev openssl} --without-javac --without-odbc";
    export KERL_BUILD_DOCS=yes;
  '';
}
```

将上述 `shell.nix` 保存到本地，运行 `nix-shell --run 'asdf install erlang <YOUR_VERSION>'` 即可一键安装指定的 Erlang 版本。

如果你稍微能看懂一点 `shell.nix` 并知道一些 Erlang 的编译选项，你会发现我把 `javac` 和 `odbc` 都去掉了，因为它们对我（以及大多数人）没用。

如果你在服务器上编译，还可以继续精简没用的 applications，例如这样：

```bash
KERL_CONFIGURE_OPTIONS="--without-javac \
  --without-odbc \
  --without-wx \
  --without-observer \
  --without-debugger"
```

将 `KERL_CONFIGURE_OPTIONS` 变量替换到 `shell.nix` 中。

通过 `shell.nix` 就可以让 asdf 轻松安装 Erlang。理论上所有从源码构建的语言都能这样做，所以 NixOS 和 asdf 并没有绝对的冲突。某些情况下 asdf 在 NixOS 上也确实会变得完全不可用，但对于 Erlang/Elixir + NixOS 这种组合，它仍然是几乎完美的开发环境。

## 不建议使用 Nix 软件源中的 Erlang

实际上不建议使用绝大多数发行版自己的软件源中的 Erlang 包，它们通常过于陈旧，也无法灵活的切换版本。当前 NixOS 的 Erlang 最新版是 25.0，这个版本有明显的 SSL 方面的 BUG，所以很快有了 25.0.1，到现在的 25.0.3。可你看 NixOS 上仍然是 25.0，这已经算比较新了，但显然这种较新的版本在 BUG 面前也简直没法用。

>由于此处只是迁移，上述的“当前”并不指博客发文时间，而是原文章的发表时间。同理，对当前版本的描述也是过时的。
{: .prompt-warning }

## 加入我们

如果你也是 Elixir 开发者/爱好者，这里有一些我创建的群组：

- Telegram 交流群：[`@elixircn_dev`](https://t.me/elixircn_dev)
- QQ 交流群：`912763380`

添加 QQ 群时请填写来源为“博客”。注意请不要灌水，谢谢。
