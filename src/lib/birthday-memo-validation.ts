export const MEMO_PAGE_SIZE = 150;
export const MEMO_NICKNAME_LIMIT = 24;
export const MEMO_MESSAGE_LIMIT = 300;
export const MEMO_TOKEN_LIFETIME_SECONDS = 600;
export const MEMO_MAX_URL_LENGTH = 6000;

export class MemoError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "MemoError";
  }
}

function validateText(value: string, field: "nickname" | "message") {
  // A replacement character may be legitimate text; lone UTF-16 surrogates are not.
  if (!value.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new MemoError("invalid_text", 400, "사용할 수 없는 문자가 포함되어 있습니다.");
  }
  if (field === "nickname" && /[\r\n\t]/u.test(value)) {
    throw new MemoError("invalid_nickname", 400, "닉네임은 한 줄로 입력해 주세요.");
  }
}

export function validateMemo(nickname: string, message: string) {
  validateText(nickname, "nickname");
  validateText(message, "message");
  if (!nickname.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, "")) {
    throw new MemoError("nickname_required", 400, "닉네임을 입력해 주세요.");
  }
  if ([...nickname].length > MEMO_NICKNAME_LIMIT) {
    throw new MemoError("nickname_too_long", 400, `닉네임은 ${MEMO_NICKNAME_LIMIT}자까지 입력할 수 있습니다.`);
  }
  if ([...message].length > MEMO_MESSAGE_LIMIT) {
    throw new MemoError("message_too_long", 400, `메시지는 ${MEMO_MESSAGE_LIMIT}자까지 입력할 수 있습니다.`);
  }
  // Unity checks the receipt against exactly what it submitted. JS and .NET Trim
  // differ for some Unicode characters, so validation must not rewrite the text.
  return { nickname, message };
}

export function validateToken(token: string) {
  if (!/^[a-f0-9]{64}$/u.test(token)) {
    throw new MemoError("invalid_token", 400, "등록 주소가 올바르지 않습니다. 생성 버튼을 다시 눌러 주세요.");
  }
  return token;
}

export function parseMemoUrl(requestUrl: string, allowedKeys: readonly string[]) {
  if (requestUrl.length > MEMO_MAX_URL_LENGTH) {
    throw new MemoError("url_too_long", 414, "등록 주소가 너무 깁니다.");
  }
  const url = new URL(requestUrl);
  try {
    // URLSearchParams silently replaces invalid UTF-8; reject it before decoding.
    for (const part of url.search.slice(1).split("&")) {
      for (const value of part.split("=")) decodeURIComponent(value.replace(/\+/gu, " "));
    }
  } catch {
    throw new MemoError("invalid_encoding", 400, "등록 주소의 문자 인코딩이 올바르지 않습니다.");
  }
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new MemoError("invalid_parameters", 400, "등록 주소의 항목이 올바르지 않습니다.");
    }
  }
  return url;
}

export function parseMemoPage(value: string | null) {
  if (value === null) return 0;
  if (!/^(0|[1-9]\d{0,6})$/u.test(value)) {
    throw new MemoError("invalid_page", 400, "페이지 번호가 올바르지 않습니다.");
  }
  return Number(value);
}

export type MemoOrder = "oldest" | "newest";
export function parseMemoOrder(value: string | null): MemoOrder {
  if (value === null || value === "oldest") return "oldest";
  if (value === "newest") return "newest";
  throw new MemoError("invalid_order", 400, "정렬 순서가 올바르지 않습니다.");
}
