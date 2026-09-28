import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { removeProfilePhoto, uploadProfilePhoto, useProfilePhoto } from '../../../lib/profilePhoto';
import { PhotoCropModal } from './PhotoCropModal';

// Profile picture block for the Settings "Profile" tab (admin and member).
export function ProfilePhotoEditor({ visibilityNote }: { visibilityNote: string }) {
  const picture = useProfilePhoto();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'upload' | 'remove'>('');
  // The chosen photo waits in the crop window until the user saves it.
  const [toCrop, setToCrop] = useState<File | null>(null);

  const onChoose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choose a JPG, PNG or WEBP picture.'); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error('Picture is too large', { description: 'Choose a picture under 15 MB.' }); return; }
    setToCrop(file);
  };

  const onCropped = async (picture: File) => {
    setBusy('upload');
    try {
      await uploadProfilePhoto(picture, { cropped: true });
      setToCrop(null);
      toast.success('Profile picture updated.');
    } catch (error) {
      toast.error('Unable to update the picture', { description: error instanceof Error ? error.message : 'Please try another picture.' });
    } finally {
      setBusy('');
    }
  };

  const onRemove = async () => {
    setBusy('remove');
    try {
      await removeProfilePhoto();
      toast.success('Profile picture removed.');
    } catch (error) {
      toast.error('Unable to remove the picture', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4 sm:flex-row sm:items-center">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-green-100 bg-green-50">
        {picture ? <img src={picture} alt="Your profile picture" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-green-700"><UserRound className="h-10 w-10" /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-gray-900">Profile Picture</h3>
        <p className="mt-1 text-sm text-gray-500">{visibilityNote}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void onChoose(event)} />
          <button type="button" onClick={() => input.current?.click()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            <Camera className="h-4 w-4" />{busy === 'upload' ? 'Uploading...' : picture ? 'Change picture' : 'Upload picture'}
          </button>
          {picture && <button type="button" onClick={() => void onRemove()} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />{busy === 'remove' ? 'Removing...' : 'Remove'}
          </button>}
        </div>
      </div>
      {toCrop && <PhotoCropModal file={toCrop} saving={busy === 'upload'} onCancel={() => setToCrop(null)} onSave={onCropped} />}
    </div>
  );
}
