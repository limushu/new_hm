export function cents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('请输入有效金额，最多两位小数');
  const [integer, decimal = ''] = value.trim().split('.');
  const amount = Number(integer) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 1e12) throw new Error('金额超出范围');
  return amount;
}
export function money(value: number) {
  return (value / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
