import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const policy = JSON.parse(readFileSync(join(root, 'src/content/privacy-policy.json'), 'utf8'));
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const markdown =
  [
    `# ${policy.title}`,
    `更新日期：${policy.updatedAt}`,
    policy.summary,
    ...policy.sections.flatMap((section) => [`## ${section.title}`, ...section.paragraphs]),
    `[支持入口](${policy.contactUrl})`,
  ].join('\n\n') + '\n';
const privacyBody = [
  `<h1>${escape(policy.title)}</h1>`,
  `<p>更新日期：${escape(policy.updatedAt)}</p>`,
  `<p>${escape(policy.summary)}</p>`,
  ...policy.sections.flatMap((section) => [
    `<h2>${escape(section.title)}</h2>`,
    ...section.paragraphs.map((p) => `<p>${escape(p)}</p>`),
  ]),
  `<p><a href="${escape(policy.contactUrl)}">联系支持</a></p>`,
].join('\n');
const help = `# 案笺使用与支持

案笺用于在设备上整理案件、日程、材料、录音与工作记录，无需注册或登录。

## 开始使用

1. 在「案件」页面点击「新建」，填写案件名称。
2. 点击「创建案件」保存名称，再按「脉络、材料、人员、费用」查看和整理内容。
3. 从「创建」新增关键节点、文档、人物或收支，为节点添加属性并关联本案对象。
4. 在「材料」中点击「添加材料」选择文件，导入时复制归档，原文件保留。
5. PDF、图片和音频可在应用内预览；其他格式可以通过材料操作菜单导出副本。
6. 录音仅在点击开始后使用麦克风。iOS 锁屏、进入后台或系统音频中断会暂停录音。

## 数据与备份

案件和材料保存在设备的应用数据目录。本机自动备份不等同于设备外备份；iOS 当前不支持整份工作区的设备外备份导出与恢复。卸载会移除本机应用数据，已有系统设备备份由系统设置管理。

## 故障排查

- 无法录音：检查系统设置中的麦克风权限，回到应用前台后重试。
- 无法读取文件：确认你选择的文件已经下载，且文件提供器允许访问。
- 导出未完成：检查目标位置是否可写，重新选择保存位置。
- 不支持预览的格式：从材料操作菜单导出副本，再用支持此格式的应用打开。

## 联系支持

[提交问题](${policy.contactUrl})。反馈时请提供应用版本、设备型号、系统版本和操作步骤。

此问题页面通常公开可见，请使用虚构数据或去除敏感信息的截图，不要上传真实案件、当事人信息、录音、密码或私钥。

[隐私政策](../privacy-policy.md)
`;
const shell = (title, body) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)}</title><link rel="stylesheet" href="style.css"></head>
<body><main><nav><a href="index.html">案笺支持</a> · <a href="privacy.html">隐私政策</a></nav>${body}</main></body></html>\n`;
const helpBody = `<h1>案笺使用与支持</h1>
<p>无需注册或登录，在设备上整理案件、日程、材料、录音和工作记录。</p>
<h2>开始使用</h2><ol><li>在「案件」点击「新建」，填写案件名称。</li><li>进入案件的「材料」页面，点击「添加材料」选择文件。</li><li>单击支持的文件格式进行预览，通过材料操作菜单移动、改名或导出副本。</li></ol>
<h2>常见问题</h2><p>无法录音时，请检查系统麦克风权限并返回应用前台。无法导入时，请确认文件已下载且文件提供器允许访问。其他格式可导出副本后在支持的应用中打开。</p>
<h2>数据与备份</h2><p>本机自动备份不等同于设备外备份。iOS 当前不支持整份工作区的设备外备份导出与恢复。卸载会移除本机应用数据；已有系统备份由系统设置管理。</p>
<h2>联系支持</h2><p><a href="${escape(policy.contactUrl)}">提交问题</a>，请提供应用版本、设备和系统版本，以及操作步骤。问题页面通常公开可见，请使用虚构数据或已去除敏感信息的截图，不要上传真实案件材料或录音。</p>`;
const files = new Map([
  ['docs/privacy-policy.md', markdown],
  ['docs/app-store/support.md', help],
  ['docs/app-store/site/privacy.html', shell(policy.title, privacyBody)],
  ['docs/app-store/site/index.html', shell('案笺使用与支持', helpBody)],
  [
    'docs/app-store/site/style.css',
    'body{margin:0;background:Canvas;color:CanvasText;font:17px/1.85 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:32px 20px 64px}nav{font-size:15px;margin-bottom:28px}h1{font-size:30px;line-height:1.4}h2{font-size:21px;margin-top:32px}a{color:LinkText;overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}\n',
  ],
]);
const check = process.argv.includes('--check');
for (const [name, content] of files) {
  const path = join(root, name);
  if (check) {
    if (readFileSync(path, 'utf8') !== content)
      throw new Error(`Regenerate App Store material: ${name}`);
  } else {
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
}
console.log(
  `${check ? 'Verified' : 'Prepared'} privacy and support pages. No store submission or hosting deployment performed.`,
);
