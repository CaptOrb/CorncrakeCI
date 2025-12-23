In `tsconfig.json`, `"rewriteRelativeImportExtensions": true` is enabled as a workaround for
<https://github.com/mnahkies/openapi-code-generator/issues/400>.

Note that we are using:

```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler"
}
```
instead of:
```json
{
  "module": "nodenext",
  "target": "esnext"
}
```
The latter configuration (nodenext) requires explicitly declaring file extensions in every import, which we want to avoid.