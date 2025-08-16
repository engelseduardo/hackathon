// trata JSON malformado
export function jsonSyntaxError(err, req, res, next) {
  // express.json() dispara SyntaxError com 'body' presente
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "JSON inválido" });
  }
  return next(err);
}

// handler genérico (para erros nas rotas)
export function genericErrorHandler(err, req, res, next) { // 4 args!
  console.error(err);
  const status = err.status || 500;
  return res.status(status).json({
    error: err.message || "Erro interno no servidor"
  });
}
