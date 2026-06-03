import { Request, Response, NextFunction } from 'express';

const MAX_STRING_LENGTH = 1000;

// 用户名/昵称：只允许中文、字母、数字、下划线
const SAFE_TEXT_REGEX = /^[一-龥a-zA-Z0-9_]+$/;

function sanitizeString(value: string): string {
  // 去除首尾空白
  let cleaned = value.trim();
  // 截断超长字符串
  if (cleaned.length > MAX_STRING_LENGTH) {
    cleaned = cleaned.slice(0, MAX_STRING_LENGTH);
  }
  // 去除 null 字节（防某些注入）
  cleaned = cleaned.replace(/\0/g, '');
  return cleaned;
}

function sanitizeObject(obj: Record<string, any>): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      obj[key] = sanitizeString(val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitizeObject(val);
    }
  }
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

// 校验用户名格式
export function isValidUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 20) return false;
  return SAFE_TEXT_REGEX.test(username);
}

// 校验昵称格式
export function isValidNickname(nickname: string): boolean {
  if (!nickname || nickname.length < 1 || nickname.length > 20) return false;
  return SAFE_TEXT_REGEX.test(nickname);
}
