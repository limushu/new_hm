import { useBackNavigation } from '../../components/useBackNavigation';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Material, SaveAction } from '../../domain/types';
import { isAudioMaterial } from '../../platform/speech';
import MaterialContent from './MaterialContent';
import './materials.css';
export default function Preview({
  item,
  onClose,
  save,
  closeLabel = '关闭预览',
}: {
  item: Material;
  onClose: () => void;
  save?: SaveAction;
  closeLabel?: string;
}) {
  useBackNavigation(onClose, 100);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => dialog.current?.close();
  }, []);
  return createPortal(
    <dialog
      className={`material-preview ${isAudioMaterial(item.name) ? 'is-audio' : ''}`}
      aria-label={`预览 ${item.name}`}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <strong ref={heading} tabIndex={-1}>
          {item.name}
        </strong>
        <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}>
          <X />
        </button>
      </header>
      <MaterialContent item={item} save={save} />
    </dialog>,
    document.body,
  );
}
