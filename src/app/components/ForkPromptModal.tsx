import { useState } from 'react';
import { Loader2, X, Sparkles, Tag } from 'lucide-react';
import { Prompt } from '../../lib/types';
import { Avatar } from './Avatar';

interface ForkPromptSaveInput {
  forkedPrompt: Partial<Prompt>;
  mediaFile: File | null;
}

interface ForkPromptModalProps {
  prompt: Prompt;
  onClose: () => void;
  onSave: (input: ForkPromptSaveInput) => Promise<void> | void;
}

export function ForkPromptModal({ prompt, onClose, onSave }: ForkPromptModalProps) {
  const [promptText, setPromptText] = useState(prompt.promptText);
  const [tags, setTags] = useState(prompt.styleTags.join(', '));
  const [aiModel, setAiModel] = useState(prompt.model);
  const [moodLabel, setMoodLabel] = useState(prompt.moodLabel);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    if (mediaFile) {
      const expectedType = prompt.contentType === 'video' ? 'video/' : 'image/';
      if (!mediaFile.type.startsWith(expectedType)) {
        setSaveError(
          prompt.contentType === 'video'
            ? 'This fork needs a video file. Please upload a video.'
            : 'This fork needs an image file. Please upload an image.',
        );
        return;
      }
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave({
        forkedPrompt: {
          promptText,
          styleTags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          model: aiModel,
          moodLabel,
        },
        mediaFile,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save fork.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto glass-surface rounded-[var(--waltube-r-xl)] border border-[var(--waltube-text-3)]">
        {/* Header */}
        <div className="sticky top-0 glass-nav border-b border-[var(--waltube-text-3)] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#4cce8a]/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#4cce8a]" />
            </div>
            <div>
              <h2 className="font-primary font-bold text-base text-white">Fork Prompt</h2>
              <p className="font-accent text-xs text-[var(--waltube-text-2)]">
                Edit and save your own version
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--waltube-surface)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--waltube-text-2)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Original Author Info */}
          <div className="glass-surface rounded-[var(--waltube-r-lg)] p-3 border border-[var(--waltube-text-3)]">
            <p className="font-accent text-xs text-[var(--waltube-text-2)] mb-2">Forked from</p>
            <div className="flex items-center gap-3">
              <Avatar
                src={prompt.authorAvatar}
                alt={prompt.authorHandle}
                size={32}
              />
              <div>
                <p className="font-accent text-xs text-[var(--waltube-text-2)]">@{prompt.authorHandle}</p>
              </div>
            </div>
          </div>

          {/* Media Upload Area */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--waltube-text-1)] mb-2">
              Upload Media ({prompt.contentType === 'video' ? 'Video' : 'Image'})
            </label>
            <label className="relative aspect-video rounded-[var(--waltube-r-lg)] overflow-hidden border-2 border-dashed border-[var(--waltube-text-3)] glass-surface flex items-center justify-center cursor-pointer hover:border-[var(--waltube-indigo)] transition-all">
              <input
                type="file"
                accept={prompt.contentType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*'}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(event) => {
                  setMediaFile(event.target.files?.[0] ?? null);
                  setSaveError(null);
                }}
              />
              {mediaFile && prompt.contentType === 'image' && (
                <img
                  src={URL.createObjectURL(mediaFile)}
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              {mediaFile && prompt.contentType === 'video' && (
                <video
                  src={URL.createObjectURL(mediaFile)}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted
                  playsInline
                />
              )}
              <div className={`text-center px-4 ${mediaFile ? 'opacity-0' : ''}`}>
                <div className="w-12 h-12 rounded-full bg-[var(--waltube-indigo)]/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-[var(--waltube-indigo)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="font-accent text-sm text-[var(--waltube-text-1)]">
                  {mediaFile ? mediaFile.name : 'Click to upload'}
                </p>
                <p className="font-accent text-xs text-[var(--waltube-text-2)] mt-1">
                  {prompt.contentType === 'video' ? 'Video only' : 'Image only'}
                </p>
              </div>
            </label>
          </div>

          {/* Prompt Text Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--waltube-text-1)] mb-2">
              Prompt Text
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--waltube-indigo)] transition-all resize-none"
              placeholder="Enter your prompt..."
            />
          </div>

          {/* Mood Label Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--waltube-text-1)] mb-2">
              Mood Label
            </label>
            <input
              type="text"
              value={moodLabel}
              onChange={(e) => setMoodLabel(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--waltube-indigo)] transition-all"
              placeholder="e.g., Dreamy, Epic, Moody..."
            />
          </div>

          {/* AI Model Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--waltube-text-1)] mb-2">
              AI Model
            </label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--waltube-indigo)] transition-all"
              placeholder="e.g., Midjourney, DALL-E, Stable Diffusion..."
            />
          </div>

          {/* Tags Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--waltube-text-1)] mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--waltube-r-lg)] border border-[var(--waltube-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--waltube-indigo)] transition-all"
              placeholder="Add tags separated by commas..."
            />
            <p className="font-accent text-xs text-[var(--waltube-text-2)] mt-1.5">
              Separate tags with commas (e.g., cyberpunk, neon, futuristic)
            </p>
          </div>

          {saveError && (
            <div className="rounded-[var(--waltube-r-md)] border border-red-500/35 bg-red-500/10 px-3 py-2 font-accent text-xs text-red-200">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 glass-nav border-t border-[var(--waltube-text-3)] px-5 py-3 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-[var(--waltube-r-pill)] glass-surface text-[var(--waltube-text-1)] font-accent text-sm font-medium hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!promptText.trim() || isSaving}
            className="px-5 py-2 rounded-[var(--waltube-r-pill)] bg-[#4cce8a] text-white font-accent text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-[#4cce8a]/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Fork'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
