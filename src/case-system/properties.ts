import type { ObjectProperty } from './contracts';
export const propertyLabels = {
  text: '文本',
  number: '数字',
  select: '单选',
  multi_select: '多选',
  date: '日期',
  checkbox: '复选框',
  relation: '关联对象',
} as const;
export function validateProperty(p: ObjectProperty) {
  if (
    !p.name.trim() ||
    [...p.name.trim()].length > 60 ||
    /[\u0000-\u001f]/.test(p.name) ||
    !(p.kind in propertyLabels) ||
    p.options.length > 50
  )
    throw new Error('请检查属性名称和类型');
  if (
    p.options.some((o) => !o.trim() || [...o].length > 80) ||
    new Set(p.options).size !== p.options.length
  )
    throw new Error('选项不能为空或重复');
  if (!['select', 'multi_select'].includes(p.kind) && p.options.length)
    throw new Error('此属性类型不需要选项');
  if (p.value === null) return;
  const v = p.value;
  const valid =
    p.kind === 'text'
      ? typeof v === 'string' && [...v].length <= 20000
      : p.kind === 'number'
        ? typeof v === 'number' && Number.isFinite(v)
        : p.kind === 'checkbox'
          ? typeof v === 'boolean'
          : p.kind === 'date'
            ? typeof v === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(v) &&
              !Number.isNaN(Date.parse(v)) &&
              new Date(v).toISOString().slice(0, 10) === v
            : p.kind === 'select'
              ? typeof v === 'string' && p.options.includes(v)
              : p.kind === 'multi_select'
                ? Array.isArray(v) &&
                  new Set(v).size === v.length &&
                  v.every((s) => p.options.includes(s))
                : false;
  if (!valid) throw new Error('属性值与类型不符');
}
