# Contributing

Thanks for helping. Bug reports, fixes and small improvements are welcome.

## Set up

Follow the quick start in the [README](README.md). You need Node 22 and PostgreSQL 13+.

```sh
npm install
npm test            # needs a local PostgreSQL
npm run lint
npm run format      # Prettier
```

## Before you open a pull request

- Keep it small and focused. One change per pull request.
- Run `npm test` and `npm run lint`. New logic that handles money, tokens or the safety limits needs a
  test.
- Don't add a dependency for a few lines of code.
- Match the surrounding code: names, comment style, and the way errors are handled.
- Never commit secrets, `.env.local` or real ad-account data.

## Bigger ideas

Open an issue first so we can agree on the approach before you write code.

## License

By contributing you agree that your contribution is licensed under the
[AGPL-3.0](LICENSE), the same as the project.
