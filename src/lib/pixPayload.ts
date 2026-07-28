/**
 * Gera o "Pix Copia e Cola" (BR Code / payload EMV do Banco Central) a partir da
 * chave Pix da loja. É um Pix estático com valor — o mesmo texto que vira o QR Code.
 *
 * Sem dependência externa: monta os campos TLV (id + tamanho + valor) e fecha com
 * o CRC16-CCITT (0x1021, init 0xFFFF), como manda o manual do BR Code.
 */

/** Monta um campo TLV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
function field(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** CRC16-CCITT (FALSE) exigido pelo BR Code, em HEX de 4 dígitos maiúsculos. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Só letras/números/espaço, sem acento, em maiúsculas — como o padrão pede. */
function ascii(value: string, max: number, fallback: string): string {
  const clean = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
  return clean || fallback;
}

/** TXID alfanumérico (máx. 25); "***" é o "sem identificador" do Pix estático. */
function txidOf(orderCode?: number | null): string {
  if (orderCode != null && Number.isFinite(orderCode)) {
    return `PED${Math.trunc(orderCode)}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  }
  return "***";
}

export type PixPayloadInput = {
  key: string;
  name: string;
  city?: string;
  amount: number;
  orderCode?: number | null;
};

/**
 * Devolve o "copia e cola" do Pix. Retorna `null` se não houver chave — a loja
 * ainda não configurou o Pix, então não há como cobrar por aqui.
 */
export function buildPixPayload({
  key,
  name,
  city,
  amount,
  orderCode,
}: PixPayloadInput): string | null {
  const pixKey = key.trim();
  if (!pixKey) return null;

  const merchantAccount = field(
    "26",
    field("00", "br.gov.bcb.pix") + field("01", pixKey)
  );
  const amountField =
    amount > 0 ? field("54", amount.toFixed(2)) : "";
  const additionalData = field("62", field("05", txidOf(orderCode)));

  const payload =
    field("00", "01") + // Payload Format Indicator
    merchantAccount +
    field("52", "0000") + // Merchant Category Code
    field("53", "986") + // moeda BRL
    amountField +
    field("58", "BR") + // país
    field("59", ascii(name, 25, "RECEBEDOR")) + // titular
    field("60", ascii(city || "", 15, "BRASIL")) + // cidade
    additionalData +
    "6304"; // id + tamanho do CRC (o valor vem a seguir)

  return payload + crc16(payload);
}
