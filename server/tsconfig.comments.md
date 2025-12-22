# tsconfig comments

```
"module": "ESNext",
"moduleResolution": "bundler",
```

`moduleResolution` of `Node` fails with some dependencies (e.g. openapi code generator), `NodeNext` fails with others (`keyed-mutex`, see <https://github.com/PaperStrike/keyed-mutex/issues/1>).
It seems like `bundler` is more permissive than both.
It will probably suffice for type checking.
