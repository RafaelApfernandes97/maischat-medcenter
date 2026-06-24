// Normalizacao e validacao de telefone brasileiro para o formato E.164.
//
// Politica conservadora ("so validos certos"): considera VALIDO apenas
// celular brasileiro completo = DDD(2) + 9 + 8 digitos. Numeros invalidos sao
// classificados para orientar a correcao manual:
//   - 'vazio'    : sem telefone.
//   - 'sem_ddd'  : parece um celular (9 digitos comecando com 9) mas sem DDD.
//   - 'incorreto': qualquer outro caso (digitos a mais/menos, fixo, etc).

const MOTIVOS = {
  vazio: 'Telefone vazio',
  sem_ddd: 'Falta DDD',
  incorreto: 'Número incorreto',
};

/**
 * Remove tudo que nao for digito e o zero de tronco a esquerda.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizePhone(raw) {
  const apenasDigitos = String(raw ?? '').replace(/\D/g, '');
  return apenasDigitos.replace(/^0+/, '');
}

/**
 * @param {string} raw  Telefone como veio do PDF ou da edicao manual.
 * @returns {{ original: string, digits: string, e164: string|null,
 *             valido: boolean, tipo: string, motivo: string|null }}
 */
export function normalizePhone(raw) {
  const original = raw == null ? '' : String(raw);
  const digits = sanitizePhone(original);

  if (digits.length === 0) {
    return invalido(original, digits, 'vazio');
  }

  let ddd = null;
  let assinante = null;
  if (digits.length === 13 && digits.startsWith('55')) {
    ddd = digits.slice(2, 4);
    assinante = digits.slice(4);
  } else if (digits.length === 11) {
    ddd = digits.slice(0, 2);
    assinante = digits.slice(2);
  }

  const dddOk = ddd != null && /^[1-9][0-9]$/.test(ddd);
  const celularOk = assinante != null && /^9[0-9]{8}$/.test(assinante);

  if (dddOk && celularOk) {
    return {
      original,
      digits,
      e164: `55${ddd}${assinante}`,
      valido: true,
      tipo: 'valido',
      motivo: null,
    };
  }

  // Celular completo (9 + 8 digitos) porem sem DDD -> so falta o codigo de area.
  if (/^9[0-9]{8}$/.test(digits)) {
    return invalido(original, digits, 'sem_ddd');
  }

  return invalido(original, digits, 'incorreto');
}

function invalido(original, digits, tipo) {
  return { original, digits, e164: null, valido: false, tipo, motivo: MOTIVOS[tipo] };
}
