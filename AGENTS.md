This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Featureflow: agreed project constraints

- This is a new project; do not change Meribel-mocks, the retrospective or previous landing pages.
- The owner's assignment explicitly requires button/state navigation without a navigation library. This takes precedence over the generated Expo Router recommendation below.
- Allowed UI: React Native View, Text, Image, ScrollView, Pressable; the owner additionally approved TextInput and expo-secure-store. Ask before adding other runtime components/libraries.
- Work in a codex/ branch and submit a PR. Do not merge without the owner's instruction. Never bypass required checks.
- Do not run EAS builds, create Expo/Apple credentials, or add .github workflows during this initial stage.
- The owner has now explicitly requested a standalone Android APK and EAS project linking. Android EAS builds/signing are authorized for this stage; iOS and CI automation remain deferred. Keep the first build interactive, never purchase a paid plan without authorization.
- Public source must contain synthetic examples only. Real team templates, feature content, databases, tokens and passwords stay outside the repository.
- Sessions go in SecureStore; shared data belongs to the private API. Never silently switch a failed API session into demo mode.
- Keep separate progress for the general checklist, each competence, DoR and DoD. Exclude N/A from the denominator; require an explanation. No applicable items means no percentage, not 100%.
- Before completing code changes run npm run lint, npm run typecheck, npm test and python -m unittest discover -s backend -v. Do not describe a bundle export as an installed APK/IPA or a device test.
- Server deployment must follow the host's own AGENTS.md. No deployment to existing landing services.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
