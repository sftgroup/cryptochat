import { useRef, useEffect } from 'react';
import { EMOJI_LIST } from '../lib/emoji';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close on outside click
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Small delay to avoid the button click that opened it
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50"
      style={{ width: 312 }}
    >
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
        {EMOJI_LIST.map((e) => (
          <button
            key={e}
            onClick={() => { onSelect(e); onClose(); }}
            className="w-9 h-9 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
