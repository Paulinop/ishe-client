# Corrección de e4steam incluida en Ishe Client

Ishe Client incluye `app/extras/e4steam-fabric-quilt-mc26.1-26.2-v0.3.2-guard.jar`: el e4steam 0.3.2
oficial (de Kamilchik, Apache License 2.0, <https://github.com/Kamilhik/e4steam>) con una comprobación
de inicio de sesión añadida. Aquí está el código de esa comprobación y la herramienta que la inserta.

- `src/.../E4steamGuestGuard.java`: la comprobación. Regla 1: un invitado de Steam no puede entrar con
  el apodo del anfitrión. Regla 2: fija cada apodo al SteamID que lo usó primero cuando el UUID no está
  ligado a Steam (archivo `<config>/e4steam/guest-nicknames.properties`).
- `test/.../GuardLogicTest.java`: pruebas de esa lógica.
- `patcher/JarPatcher.java`: modifica el .jar oficial (con ASM) para llamar a la comprobación al final
  de `PlayerListMixin.allowOwnerLogin`, y añade `META-INF/E4STEAM-UNOFFICIAL-PATCH.txt`.
- `simulacion/`: clases de relleno y arnés para cargar el .jar modificado en una JVM y comprobar que
  el verificador lo acepta.
- `unlock_263.py`: amplía el rango de versiones declarado a `<26.4` (experimental, sin probar en el juego).

El .jar incluido no se recompila desde aquí en el día a día: su SHA-256 está fijado en
`app/core/installer.js` (`E4STEAM_SHA256`). Cambiar el .jar exige cambiar ese valor.

Estado: comprobado solo por simulación; nunca se ha probado dentro de Minecraft.
