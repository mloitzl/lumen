---
title: "Variance and Covariance in C# (with a Haskell Detour)"
date: "2025-08-23T11:11:11.000Z"
template: "post"
slug: "/posts/variance-and-covariance"
draft: true
tags: 
    - csharp
    - generics
    - haskell
    - variance
    - covariance
    - software-engineering
summary: "Variance and covariance explained theoretically and applied practically in modern C#. Featuring Haskell type classes, generic interfaces with in/out, and real-world async examples."
---

A friendly colleague asked me the other day:  

*"What’s the deal with covariance and contravariance in C#? I always forget where `in` and `out` go."*  

This is one of those questions that sounds simple, but as soon as you start explaining, you realize it touches on type theory, category theory, and occasionally the boundaries of your patience. So, let’s try to frame it carefully.  

## Variance in Theory (feat. Haskell)

At a high level, **variance** describes how type constructors behave when the types they wrap change in a subtype relation. In plain terms: if `Dog` is a subtype of `Animal`, should `Box<Dog>` be considered a subtype (covariance), a supertype (contravariance), or neither (invariance) of `Box<Animal>`?  

Haskell, being Haskell, tends to give us the cleanest definitions.  

### Covariance

A `Functor` describes covariance:  

```haskell
class Functor f where
    fmap :: (a -> b) -> f a -> f b
```

A `List a` is a functor. If you can transform every `a` into a `b`, you can turn a `List a` into a `List b`. This is **covariance**: the container “follows” the direction of the function.  

### Contravariance

The opposite is `Contravariant`:  

```haskell
class Contravariant f where
    contramap :: (b -> a) -> f a -> f b
```

Here a function `(b -> a)` lets you turn an `f a` into an `f b`. This is **contravariance**: the container goes “against” the direction of the function.  

### Variance via Function Types (with Diagram)

One of the simplest illustrations is function types. Consider:  

```haskell
-- A function type (arg -> result)
```

- The argument type position is **contravariant**.  
- The return type position is **covariant**.  

To visualize it, suppose we have these subtype relationships:

```
  Animal
    ↑
   Dog
```

Variance in function types works as follows:

```haskell
-- Contravariance in argument position:
(Dog -> Cat) <: (Animal -> Cat)

-- Covariance in return position:
(Animal -> Dog) <: (Animal -> Animal)

```

Here is a simple ASCII diagram to clarify:

```
TYPE VARIANCE IN FUNCTION SIGNATURES:

        Argument (input)   |   Return (output)
  -------------------------|------------------------
         Contravariant     |      Covariant
              (in)         |        (out)

In function type: (in)  ->  (out)
```

To sum up:  
- Inputs are **contravariant**  
- Outputs are **covariant**  

Hold onto this mental model as it directly maps to C# generics' `in` and `out`.  

## Variance in C#: Out and In

C# doesn’t use type classes, but it lets us annotate generic type parameters with **variance modifiers** that specify safe subtyping rules:  

- `out` means **covariant** (you can only return or produce values of `T`)  
- `in` means **contravariant** (you can only consume or accept values of `T`)  

Mnemonic time:  

- `in` → **CoNtravariance** (remember the *N*)  
- `out` → **Covariance** (think *out*-put)  

Two classic examples from .NET’s BCL should be familiar:  

```cs
public interface IEnumerable<out T> { ... }
public interface IComparer<in T> { ... }
```

Why these choices?  
- `IEnumerable<T>` produces sequence elements, so it’s **covariant**.  
- `IComparer<T>` consumes elements to compare them, so it’s **contravariant**.  

## Real-World Modern C# Examples

Variance is not just theoretical—it shows up in all kinds of practical modern C# code.

### Async Streams (`IAsyncEnumerable<out T>`)

With async streams introduced in C# 8, the variance principle shines:  

```cs
async IAsyncEnumerable<Dog> GetDogsAsync() { ... }

// Covariance lets you assign to a more general type:
IAsyncEnumerable<Animal> animals = GetDogsAsync();
```

Without covariance, this neat and type-safe upcasting wouldn’t be allowed.  

### Read-Only Collections

Read-only interfaces are typically covariant since they only expose data:  

```cs
IReadOnlyList<Dog> dogs = ...
IReadOnlyList<Animal> animals = dogs; // perfectly valid due to covariance
```

`IReadOnlyList<out T>` can produce values but not consume them, so safe covariance applies.  

Contrast with mutable collections:

```cs
IList<Animal> animals = new List<Dog>(); // Error: IList<T> is invariant
animals.Add(new Cat());                  // This would break type safety, so disallowed
```

### Comparers and Dependency Injection

Contravariance comes in handy when you consume values, for example with comparers:  

```cs
class AnimalNameComparer : IComparer<Animal>
{
    public int Compare(Animal? x, Animal? y) =>
        string.Compare(x?.Name, y?.Name, StringComparison.Ordinal);
}

IComparer<Dog> dogComparer = new AnimalNameComparer();
```

This compiles because `IComparer<T>` is contravariant (`in T`): a comparer for `Animal` can also handle `Dog`. Handy for registering services in dependency injection containers for base types while resolving derived types.  

### Async LINQ Extensions

Async LINQ operators use variance too:  

```cs
await foreach (Animal a in GetDogsAsync().OfType<Animal>())
{
    ...
}
```

Here, covariance in `IAsyncEnumerable<out T>` allows seamless upcasting during enumeration.  

### Why isn’t Everything Covariant or Contravariant?

Variance is only safe if the interface respects its output/input constraints. If an interface both consumes and produces `T`, the compiler forbids variance to prevent runtime type errors.  

Example:  

```cs
IList<Animal> animals = new List<Dog>(); // Compilation error
```

Allowing variance here would mean you could insert a `Cat` into a list of `Dog`, breaking runtime safety.  

Thus, variance is a “when safe” feature, not a free-for-all.  

## Wrapping Up

Variance is a powerful tool in your generic programming toolkit:  

- **Covariance (`out`)**: You get outputs (values).  
- **Contravariance (`in`)**: You provide inputs (consume values).  
- **Invariance**: You both consume and produce, so no variance allowed.  

Thanks to Haskell’s elegant theory and .NET’s pragmatic implementation, you can write safer and more flexible APIs with less friction.  

Whenever you forget the difference, just remember:  

- **`in` for CoNtravariance** (the *N* makes all the difference)  
- **`out` for Covariance** (think output)  
```

<span style="display:none">[^1][^2][^3][^4][^5][^6][^7][^8][^9]</span>

<div style="text-align: center">⁂</div>

[^1]: https://www.itl.nist.gov/div898/software/dataplot/refman2/ch4/varicova.pdf

[^2]: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/vcov.html

[^3]: https://www.geeksforgeeks.org/covariance-matrix/

[^4]: https://en.wikipedia.org/wiki/Covariance_matrix

[^5]: https://towardsdatascience.com/a-visual-explanation-of-variance-covariance-correlation-and-causation-dcf762801029/

[^6]: https://www.kaggle.com/code/viktorreichert/tutorial-visualization-of-covariance-and-variance

[^7]: https://stackoverflow.com/questions/36071729/variance-covariance-matrix-in-spss-program

[^8]: https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science)

[^9]: https://evamaerey.github.io/statistics/covariance_correlation.html

