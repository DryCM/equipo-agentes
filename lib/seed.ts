// The small website every run starts from. The agents edit a copy of it.
export type Files = Record<string, string>;

export const seedFiles: Files = {
  "index.html": `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Panadería Lucía</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Panadería Lucía</h1>
    <nav><a href="index.html">Inicio</a> <a href="productos.html">Productos</a></nav>
  </header>
  <main>
    <h2>Pan artesano desde 1985</h2>
    <p>Horneamos cada mañana con masa madre y harinas ecológicas.</p>
  </main>
  <footer>© Panadería Lucía</footer>
</body>
</html>
`,
  "productos.html": `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Productos · Panadería Lucía</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Panadería Lucía</h1>
    <nav><a href="index.html">Inicio</a> <a href="productos.html">Productos</a></nav>
  </header>
  <main>
    <h2>Productos</h2>
    <ul><li>Hogaza de centeno</li><li>Baguette</li><li>Croissant de mantequilla</li></ul>
  </main>
  <footer>© Panadería Lucía</footer>
</body>
</html>
`,
  "styles.css": `body { font-family: system-ui, sans-serif; margin: 0; color: #2b2118; background: #fffaf3; }
header { background: #7a4b24; color: #fff; padding: 1rem 1.5rem; }
header h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
nav a { color: #ffe7c7; margin-right: 1rem; }
main { padding: 1.5rem; max-width: 720px; }
footer { padding: 1rem 1.5rem; color: #8a7560; }
`,
};
