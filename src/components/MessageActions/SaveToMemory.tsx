import { useState } from 'react';
import { Check, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Section } from '@/lib/hooks/useChat';

const SaveToMemory = ({
  section,
  message,
}: {
  section: Section;
  message: string;
}) => {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy || saved) return;
    setBusy(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: (section.message.query || 'Vane answer').slice(0, 200),
          summary: message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(true);
        toast.success('Saved to shared memory');
      } else {
        toast.error(data.message || 'Failed to save to memory');
      }
    } catch (err) {
      toast.error('Failed to save to memory');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={save}
      title="Save this answer to shared memory"
      className="p-2 text-black/70 dark:text-white/70 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary transition duration-200 hover:text-black dark:hover:text-white"
    >
      {saved ? <Check size={16} /> : <Database size={16} />}
    </button>
  );
};

export default SaveToMemory;
