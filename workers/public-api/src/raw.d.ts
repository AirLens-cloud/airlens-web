// Vite's `?raw` suffix imports a file's text as a string (vitest resolves it the
// same way). Declared by hand because this project's tsconfig loads only the
// Workers types, not vite/client.
declare module '*?raw' {
  const text: string;
  export default text;
}
