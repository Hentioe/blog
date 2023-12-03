---
title: Elixir 与 Rust 协作开发
date: 2023-11-21 +0800
categories: [技术, 编程]
tags: [Elixir, Rust, rustler]     # TAG names should always be lowercase
---

## 前言

我主用的开发语言是 Elixir 和 Rust，尤其是 Elixir 在我很有限的编程经历中算使用很长了。在前期我始终将它们独立使用，各自解决不同的问题。直到后来，我才开始尝试在 Elixir 中集成 Rust，在优化性能的同时共享 Rust 的丰富生态。

自此不可收拾，在具备一定复杂度的 Elixir 项目中，我基本上都会集成 Rust 代码。

>在 [2023 年 Stack Overflow 开发者调查](https://survey.stackoverflow.co/2022#most-loved-dreaded-and-wanted-language-love-dread) 中统计的最受欢迎的编程语言里，Rust 和 Elixir 分别排行第一和第二。但这和我选择它们没有任何关系，只是一个巧合。
{: .prompt-info }

_我很想从浅入深的解释此文涉及的方方面面，但我意识到需要太长时间。所以，我打算先发一部分细节不多的内容，有待后续完善。_

## Erlang NIF

NIF 即 Native Implemented Function（原生实现函数），它是 Erlang 内置的和 native 接口（必须是 C ABI）交互的机制。在通用的称呼上，我们一般将这类函数调用称之为 FFI（外部函数接口）调用。让 Elixir 发起 FFI 调用也是通过 Erlang 的 NIF 实现的。

NIF 相比于直接对库函数进行绑定，存在一些缺点，但都是可以理解的。例如 NIF 需要在 native 代码中导入 NIF 的头文件，这导致我们不得不写 C/C++ 代码，且无法与 C/C++ 之外的原生语言直接集成。

我们需要导入 `erl_nif.h`，并通过它构造我们的 native 函数。此头文件还为我们提供了一系列的类型转换工具函数和能对运行时产生副作用的函数。前者可以利于我们实现 Erlang 到 C 之间的类型转换，后者可以优化虚拟机的调度和内存，降低 NIF 调用对虚拟机的负面影响。

我们可以调用 `enif_make_atom` 函数在 native 代码中生成 `atom` 类型，调用 `enif_consume_timeslice` 函数让出 CPU 机会以避免阻塞 Erlang 进程（让其重新参与调度，这至关重要）。等等。

_虽然 NIF 不如直接绑定库函数方便，但它可以做更多的优化。在某些协作式调度的语言中，FFI 调用可能会阻塞整个调度器，因为它没有像 Erlang 这样设计，没有提供给 native 代码影响运行时的机会。_

## Rustler

[rustler](https://github.com/rusterlium/rustler) 是一个了不起的库，它历史悠久，十分便捷。它会为我们生成许多底层代码（包含函数包装、类型转换等），轻松的完成与 Rust 代码的集成。它生成的函数仍然是规规矩矩的 NIF，又足以让我们无需关心太多对 NIF 的包装，专注于功能实现。

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
  @spec add(integer(), integer()) :: integer()
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

### 复合类型的参数

在上面的例子中，我们仅使用了 `integer`（或者说 Rust 的 `i64`）这种基本类型作为参数和返回值，这肯定是不够用的。在以往其它语言的 FFI 绑定的经验里，通常要将复合类型中的非基本字段以及自身逐个转换为指针，将指针传递给 native 函数，再从 native 函数逐个解析并还原为原生复合类型。这导致绑定虽然只是一层包装，但面对数量众多的接口时也要编写大量的代码，十分不便。

[rustler](https://github.com/rusterlium/rustler) 对这方面提供良好的支持，它在背后自动生成所有转换代码。无论是 Elixir 还是 Rust，我们都可以直接操作原生复合类型（Elixir 的 `struct`/`map` 和 Rust 的 `struct`）来使用。这是一个例子：

添加一个新的 native 函数和所需的结构体：

```rust
use rustler::NifStruct;

// 省略 add 函数...

// 重点1：在（作为参数的）结构体上派生 `NifStruct`。
// 重点2：添加 `module` 属性并赋值为对应的 Elixir 模块名。
#[derive(Debug, NifStruct)]
#[module = "HelloRustler.Math.UniversalInput"]
pub struct UniversalInput {
    // 左值
    pub left: i64,
    // 右值
    pub right: i64,
    // 运算符
    pub operator: i64,
}

#[rustler::nif]
fn caculate(input: UniversalInput) -> i64 {
    match input.operator {
        1 => input.left + input.right,
        2 => input.left - input.right,
        3 => input.left * input.right,
        _ => 0,
    }
}

// 注意，你必须将 `caculate` 函数名添加到此处才能绑定。
rustler::init!("Elixir.HelloRustler.Math", [add, caculate]);
```

_我们的新函数 `caculate` 从输入中动态决定运算符，所以我将其参数命名为 `UniversalInput`（通用输入）。_

创建 `lib/hello_rustler/math/universal_input.ex` 文件，内容如下：

```elixir
# 此处的模块名称和 Rust 代码中的要一样。
defmodule HelloRustler.Math.UniversalInput do
  @enforce_keys [:left, :right, :operator]
  defstruct [:left, :right, :operator, :result]

  @type t :: %__MODULE__{
    left: integer,
    right: integer,
    operator: integer
  }
end
```

在 `lib/hello_rustler/math.ex` 中添加新的函数绑定：

```elixir
# When your NIF is loaded, it will override this function.
@spec caculate(HelloRustler.Math.UniversalInput.t()) :: integer()
def caculate(_input), do: :erlang.nif_error(:nif_not_loaded)
```

通过 IEx 调用这个函数：

```elixir
iex> alias HelloRustler.Math
HelloRustler.Math
iex> Math.caculate %Math.UniversalInput{left: 1, right: 99, operator: 1}
100
iex> Math.caculate %Math.UniversalInput{left: 1, right: 99, operator: 2}
-98
iex> Math.caculate %Math.UniversalInput{left: 1, right: 99, operator: 3}
99
```

这并非一个有实际价值的例子，它为了尽量简化代码突出重点，其设计是简陋和非主流的。例如，运算符我们应该用 Rust 枚举而不是整数，且没有处理不受支持的运算符只是简单的返回 `0`。

### Elixir 风格的返回值

在上面的例子中，我们并没有处理错误，故也没有设计如何返回错误。碰巧的是，Rust 的 `Result` 和 Elixir 风格的返回值其实具有类似的本质。所以 [`rustler`](https://hex.pm/packages/rustler) 对 `Rustlt` 进行了专门的特征实现，以自动转换返回值为 Elixir 风格。

>你们可以自行思考一下 `{:ok, value}`/`{:error, reason}` 和 `Ok(v)`/`Err(e)` 的相似之处。
{: .prompt-warning }

下面的例子我将不再手把手告知编辑哪些文件，并且仅给出整体或局部的代码。

```rust
use rustler::Atom;

// 定义我们需要使用的 atoms。
mod my_atoms {
    rustler::atoms! {
        // 一个表达「不支持的运算符」错误的 atom。
        unsupported_operator,
    }
}

// 返回 `Result<i64, Atom>`，即 `Ok(i64)` 或 `Err(Atom)`。
#[rustler::nif]
fn caculate(input: UniversalInput) -> Result<i64, Atom> {
    match input.operator {
        1 => Ok(input.left + input.right),
        2 => Ok(input.left - input.right),
        3 => Ok(input.left * input.right),
        _ => 
        // 返回错误，不支持的运算符。
        Err(my_atoms::unsupported_operator()),
    }
}
```

再次调用 `caculate/2` 函数：

```elixir
iex> alias HelloRustler.Math
HelloRustler.Math
iex> Math.caculate %Math.UniversalInput{left: 1, right: 99, operator: 1}
{:ok, 100}
iex> Math.caculate %Math.UniversalInput{left: 1, right: 99, operator: 4}
{:error, :unsupported_operator}
```

>别忘了将函数的 `@spec` 的返回值部分改为 `{:ok, integer} | {:error, atom}`，以避免 Dialyzer 产生错误。
{: .prompt-warning }

可以看到我们的绑定函数的返回值已经符合 Elixir 的风格，并能正确返回错误原因。同上，这个例子的实际价值也不太大，因为我们不总是满足于返回 `atom` 作为错误原因。

在 Rust 中错误处理通常会将所有错误包装在自己的错误类型中，我们给自己的错误类型实现 `rustler::types::Encoder` 即可集中处理错误的返回格式。例如返回一个结构体作为原因，并包含错误消息、错误码等。

我本人开发的 [`img_grider`](https://github.com/gramlabs-oss/img_grider) 库，它返回的错误是这样的：`{:error, %ImgGrider.Error{kind: :magick_exception, message: "failed to read image"}}`。它包含 `kind` 和 `message`，分别可用于匹配错误类型和显示错误细节。

## 优化调度

对于上面的例子，其实我们并不需要做调度方面的优化，因为这些函数的运行时长极其短暂。一般认为运行时长小于 `1ms` 的 NIF，无需优化，因为它们对调度系统几乎造成不了负面影响。

当然实际中，我们有很多例子是不满足这个时长条件的，因为有很多库的任务类型是 CPU 密集的。例如我们调用 `MagickWand` 库的 API 处理图像，它可能要数毫秒甚至数百毫秒才能返回。在此类情况下若不做调度上的优化必然会给调度系统带来显著的负面影响，降低整个运行时的响应速度，严重的甚至会长时间阻塞调度器甚至让调度器崩溃。

所谓“优化”一词，实际上是我个人的说法。更加精准的解释就是让 NIF 适应和参与调度系统，或独立于常规调度器之外。这样做的目的都是为了避免给 Erlang 原生进程的调度带来负面影响。

### Dirty NIF

Dirty NIF 指的是难以参与到常规调度中且需要长时间运行的 NIF，我们可以将它们主动“隔离”开来。这些被隔离的就是 Dirty NIF。

Erlang 为我们提供了两个标识，用于分类 Dirty NIFs，此处简写为 `dirty_cpu` 和 `dirty_io`。这是两个不同的调度器，它们分别用来归类 CPU 密集型和 IO 密集型的 Dirty NIFs。这两个调度器有一些差异，如 Dirty CPU 的调度器数量默认和 CPU 个数一致，而 Dirty IO 调度器默认数量是 `10`。

在 Rustler 中，我们为 `rustler::nif` 属性添加 `schedule` 参数即可归类 Dirty NIF。如 `#[rustler::nif(schedule = "DirtyCpu")]` 表示将此函数归类为 `dirty_cpu`。赋值 `DirtyIo` 表示归类为 `dirty_io`。具体代码例子就不列举了，毕竟只是添加一个属性参数而已。

在运行时中，Dirty CPU 的调度器们和 Dirty IO 的调度器们各有独立的运行队列（各自只有一个），不同类型的调度器管理的运行队列之间不会互相迁移任务。也就是说正确的归类 Dirty NIF 是很必要的，否则会给特定的调度器带来负面影响。

_此章节未完待续。_

## 加入我们

如果你也是 Elixir 开发者/爱好者，这里有一些我创建的群组：

- Telegram 交流群：[`@elixircn_dev`](https://t.me/elixircn_dev)
- QQ 交流群：`912763380`

添加 QQ 群时请填写来源为“博客”。注意请不要灌水，谢谢。
