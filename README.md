# Ishe Client

> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

Ishe Client is a small, free, non-commercial custom launcher for **Minecraft: Java Edition**, made by Guishe for personal use with a small group of friends.

It sets up a ready-to-play Minecraft 26.2 instance with the Fabric mod loader and a short list of mods, so everyone in the group plays with the same setup.

## What it does

- Signs each player in with **their own Microsoft account** and checks that the account owns Minecraft: Java Edition (see Project status).
- The game, libraries and assets come **only from Mojang's official servers**.
- Installs the Fabric mod loader and the mods listed below.
- Keeps everything in its own folder, separate from the player's normal Minecraft installation.
- Runs on Windows and macOS.

## What it does not do

- **No offline or unauthenticated mode.** The game is only started for accounts that own it.
- **No redistribution of Minecraft.** No game files are included in this project or its downloads.
- No ads, no payments, no telemetry.

## Project status

Early development.

- **Working today:** instance setup (Fabric, mods, profile) and hand-off to the official Minecraft Launcher, which signs in and starts the game.
- **Implemented, waiting for approval:** Microsoft sign-in (device code flow), ownership check and direct game start from Ishe Client. Until the project's application ID is approved for the Minecraft Services API, Ishe Client keeps using the hand-off above.

## Updates

Ishe Client updates only its own files (the launcher's interface and logic, well under 1 MB), never Minecraft itself. On start it looks at this repository's latest release for an update notice, and uses it only if the notice is signed with the project's Ed25519 key and every file matches its SHA-256. If a new version fails to start, the previous one is restored automatically.

## Accounts and privacy

- Sign-in uses Microsoft's standard OAuth 2.0 flow for desktop applications (public client, no client secret).
- Sign-in tokens are stored only on the player's own computer.
- Tokens are sent only to Microsoft, Xbox and Minecraft services. Ishe Client has no server of its own.

## Mods installed

All mods belong to their authors and are downloaded from their official pages.

| Mod | Purpose | Source |
| --- | --- | --- |
| Fabric Loader and Fabric API | Mod loader and base library | [fabricmc.net](https://fabricmc.net) |
| Sodium | Performance | [Modrinth](https://modrinth.com/mod/sodium) |
| Lithium | Performance | [Modrinth](https://modrinth.com/mod/lithium) |
| FerriteCore | Memory usage | [Modrinth](https://modrinth.com/mod/ferrite-core) |
| FancyMenu (with Konkrete and Melody) | Main menu customization | [Modrinth](https://modrinth.com/mod/fancymenu) |
| Mod Menu (with Text Placeholder API) | In-game mod list | [Modrinth](https://modrinth.com/mod/modmenu) |
| e4steam | Play with friends over Steam peer-to-peer | [GitHub](https://github.com/Kamilhik/e4steam) |

e4steam is by Kamilchik and licensed under the Apache License 2.0. Ishe Client bundles a modified build of e4steam 0.3.2 with one extra login check; the change is described inside the bundled file.

## Built with

- [Electron](https://www.electronjs.org) (MIT License)

## Contact

Questions or problems: open an issue in this repository.

---

## En español

Ishe Client es un launcher propio, gratuito y sin fines comerciales para **Minecraft: Java Edition**, hecho por Guishe para jugar con un grupo pequeño de amigos.

**NO ES UN PRODUCTO OFICIAL DE MINECRAFT. NO ESTÁ APROBADO POR MOJANG NI MICROSOFT, NI ASOCIADO CON ELLOS.**

- Cada jugador inicia sesión con su propia cuenta de Microsoft, y el juego solo se abre para cuentas que tienen Minecraft: Java Edition (ya programado; hasta que Mojang apruebe la aplicación, el inicio de sesión lo hace el launcher oficial).
- El juego se descarga únicamente de los servidores oficiales de Mojang; este proyecto no incluye ni redistribuye archivos de Minecraft.
- Instala Fabric y los mods de la tabla de arriba, en una carpeta separada del Minecraft normal.
- No tiene modo sin cuenta, anuncios, pagos ni telemetría.
