---
title: Elixir 与 Rust 协作开发
date: 2023-11-21 +0800
categories: [技术, 编程]
tags: [Elixir, Rust, rustler]     # TAG names should always be lowercase
---

## 前言

我主用的开发语言是 Elixir 和 Rust，尤其是 Elixir 在我很有限的编程经历里算使用很久了。在前期我始终将它们独立使用，各自解决不同的问题。直到后来，我才开始尝试在 Elixir 中集成 Rust，在优化性能的同时共享 Rust 的丰富生态。

自此不可收拾，在具备一定复杂度的 Elixir 项目中，我基本上都会集成 Rust 代码。

>在 [2023 年 Stack Overflow 开发者调查](https://survey.stackoverflow.co/2022#most-loved-dreaded-and-wanted-language-love-dread) 中统计的最受欢迎的编程语言里，Rust 和 Elixir 分别排行第一和第二。但这和我选择它们没有任何关系，只是一个巧合。
{: .prompt-info }

_我很想从浅入深的解释此文涉及的方方面面，但我意识到需要太长时间。所以，我打算先发一部分细节不多的内容，有待后续完善。_

## Erlang NIF

Elixir 发起 FFI 调用，也是通过 Erlang 的 NIF 实现的。NIF 相比于直接对库函数进行绑定而言，存在一些缺点，但这些都是可以理解的。例如 NIF 需要在 native 代码中导入 NIF 的头文件，这导致我们不得不写 C/C++ 代码，且无法与 C/C++ 之外的原生语言直接集成。

我们需要导入 `erl_nif.h`，并通过它构造我们的 native 函数。

头文件为我们提供了一些类型转换的工具函数以及运行时相关的函数。前者可以利于我们实现 Erlang 到 C 之间的类型转换，后者可以优化虚拟机的调度和内存，降低 NIF 调用对虚拟机的负面影响。

我们可以调用 `enif_make_atom` 函数在 native 代码中生成 `atom` 类型，调用 `enif_consume_timeslice` 函数让出 CPU 机会以避免阻塞 Erlang 进程（让其重新参与调度，这至关重要）。等等。

_虽然 NIF 不如直接绑定库函数方便，但它可以进行更多的优化。在某些协作式调度的语言中，FFI 调用可能会阻塞整个运行时，因为它没有像 Erlang 这样设计，没有提供给 native 代码影响运行时的机会。_

## Rustler

[rustler](https://github.com/rusterlium/rustler) 是一个了不起的库，它历史悠久，十分便捷。它可以帮助我们轻松的实现 Rust 代码的集成，且无需关心太多对 native 函数的包装，专注于功能实现。

### 入门

首先创建我们的 Elixir 项目（`hello-rustler`），然后：

1. 在 `deps` 中添加 [`rustler`](https://hex.pm/packages/rustler) 依赖。如 `{:rustler, "~> 0.30.0", runtime: false}`。
1. 在项目根目录创建 `native` 目录。
1. 进入 `native` 目录，执行 `cargo new --lib calculator` 创建一个 Rust 库。

此时文件树如下：

```plaintext
.
├── lib
│   └── hello_rustler.ex
├── mix.exs
├── native
│   └── calculator
│       ├── Cargo.toml
│       └── src
│           └── lib.rs
├── README.md
└── test
    ├── hello_rustler_test.exs
    └── test_helper.exs
```

在编码前我们还需要向 Rust 模块添加 [`rustler`](https://crates.io/crates/rustler) 依赖（请注意这是一个 crate），并添加 `[lib]` 配置：

```toml
[lib]
name = "calculator"
path = "src/lib.rs"
crate-type = ["cdylib", "rlib"]
```

_通常我们需要编写 Rust 的测试和 Benchmark 代码，所以我们将它作为 `cdylib` 的同时，也作为一个 `rlib`。_

接着我们添加第一个 native 函数，编辑 `native/calculator/src/lib.rs` 文件：

```rust
#[rustler::nif]
pub fn add(left: i64, right: i64) -> i64 {
    left + right
}

rustler::init!("Elixir.HelloRustler.Math", [add]);
```

这里我们定义了一个 `add` 函数，它接受两个整数参数，返回相加的值。然后我们对 `calculator` 模块和 `add` 函数进行必要配置和绑定。

创建 `lib/hello_rustler/math.ex` 文件，添加如下内容：

```elixir
defmodule HelloRustler.Math  do
  use Rustler, otp_app: :hello_rustler, crate: "calculator"

  # When your NIF is loaded, it will override this function.
  def add(_left, _right), do: :erlang.nif_error(:nif_not_loaded)
end
```

_此模块配置 Rustler 的同时绑定了 `add` 函数。请注意此处的 `crate` 名称，它需要和相对应的 Rust 模块配置文件中的 `[lib] -> name` 一致。_

此时我们再执行 `iex -S mix`，会发现在编译 Elixir 代码的过程中还会调用 Cargo 编译 Rust 代码。

进入 IEx 后，调用 `HelloRustler.Math.add/2` 函数：

```elixir
iex> HelloRustler.Math.add 99, 1
100
```

_大功告成，这便是最基本的 Rustler 使用指南。_

### 复杂参数

_待写。_

### Elixir 风格的返回值

_待写。_

## 加入我们

如果你也是 Elixir 开发者/爱好者，这里有一些我创建的群组：

- Telegram 交流群：[`@elixircn_dev`](https://t.me/elixircn_dev)
- QQ 交流群：`912763380`

添加 QQ 群时请填写来源为“博客”。注意请不要灌水，谢谢。
