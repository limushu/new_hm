import Dialog from '../../components/Dialog';
import policy from '../../content/privacy-policy.json';
import './privacy.css';

export default function PrivacyPolicy({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={policy.title} onClose={onClose} className="privacy-dialog">
      <article className="privacy-policy" aria-label="隐私政策正文" tabIndex={0}>
        <p className="field-hint">更新日期：{policy.updatedAt}</p>
        <p>{policy.summary}</p>
        {policy.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p>支持入口：{policy.contactUrl}</p>
      </article>
    </Dialog>
  );
}
