const fs = require('fs');
const file = 'app/noticias.json';
let data = JSON.parse(fs.readFileSync(file, 'utf8'));
data[0].titulo = "Versión 1.6.4: solución definitiva";
data[0].texto = "Solucionado el problema que hacía que el launcher se quedara en blanco o que el juego crasheara por mods incompatibles. Todo ha vuelto a la normalidad y ya se puede jugar perfectamente.";
fs.writeFileSync(file, JSON.stringify(data, null, 2));
