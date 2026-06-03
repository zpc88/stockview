// 去除HTML标签并转义危险字符（用于提交数据前）
export function sanitizeInput(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '') // 去除HTML标签
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// 轻量清理：只去除HTML标签，不做实体编码（用于onChange输入框，避免反复编码）
export function stripTags(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .trim();
}

// 转义HTML实体（用于显示用户内容）
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// 用户名校验：3-20字符，只允许字母数字中文下划线
export function isValidUsername(str: string): boolean {
  if (!str || str.length < 3 || str.length > 20) return false;
  return /^[一-龥a-zA-Z0-9_]+$/.test(str);
}

// 密码校验：6-50字符，不含空格和HTML字符
export function isValidPassword(str: string): boolean {
  if (!str || str.length < 6 || str.length > 50) return false;
  return !/[\s<>]/.test(str);
}

// 昵称校验：1-20字符，不允许HTML标签字符
export function isValidNickname(str: string): boolean {
  if (!str || str.length < 1 || str.length > 20) return false;
  return !/[<>"']/.test(str);
}
