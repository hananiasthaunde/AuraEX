// Alias histórico para `node server.mjs`. Reexporta o handler para o caso de o
// Vercel escolher este ficheiro como entrypoint em vez do server.mjs: sem um
// export default o runtime falha com "No exports found in module".
export { default } from './server.mjs';
