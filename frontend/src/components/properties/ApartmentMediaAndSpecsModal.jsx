import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { apartmentService, resolveMediaUrl } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Upload, Star, Trash2, ArrowUp, ArrowDown, Plus, Sparkles, ShieldCheck, Image as ImageIcon } from 'lucide-react';

export default function ApartmentMediaAndSpecsModal({ isOpen, onClose, apartment, onUpdated }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('MEDIA');
  const [saving, setSaving] = useState(false);

  // Media state
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Amenities state
  const [amenities, setAmenities] = useState([]);

  // Technical specs & visibility state
  const [techSpecs, setTechSpecs] = useState({
    room_configuration: '',
    equipment_appliances: '',
    climate_control: '',
    connectivity_entertainment: '',
    custom: [],
  });
  const [isActive, setIsActive] = useState(true);

  const loadMedia = useCallback(async () => {
    if (!apartment?.id) return;
    setLoadingMedia(true);
    try {
      const res = await apartmentService.getMedia(apartment.id);
      setMedia(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setMedia([]);
    } finally {
      setLoadingMedia(false);
    }
  }, [apartment?.id]);

  const loadAmenities = useCallback(async () => {
    if (!apartment?.id) return;
    try {
      const res = await apartmentService.getAmenities(apartment.id);
      const list = Array.isArray(res?.data) ? res.data : [];
      if (list.length > 0) {
        setAmenities(list.map((a) => ({ name: a.name || '', description: a.description || '' })));
      } else if (Array.isArray(apartment.amenities)) {
        setAmenities(apartment.amenities.map((n) => (typeof n === 'string' ? { name: n, description: '' } : { name: n.name || '', description: n.description || '' })));
      } else {
        setAmenities([]);
      }
    } catch {
      setAmenities([]);
    }
  }, [apartment]);

  useEffect(() => {
    if (isOpen && apartment?.id) {
      setActiveTab('MEDIA');
      setIsActive(apartment.is_active !== false && apartment.is_active !== 0);
      const rawSpecs = typeof apartment.technical_specs === 'string'
        ? (() => { try { return JSON.parse(apartment.technical_specs); } catch { return {}; } })()
        : (apartment.technical_specs || {});
      setTechSpecs({
        room_configuration: rawSpecs.room_configuration || '',
        equipment_appliances: rawSpecs.equipment_appliances || '',
        climate_control: rawSpecs.climate_control || '',
        connectivity_entertainment: rawSpecs.connectivity_entertainment || '',
        custom: Array.isArray(rawSpecs.custom) ? rawSpecs.custom : [],
      });
      loadMedia();
      loadAmenities();
    }
  }, [isOpen, apartment, loadMedia, loadAmenities]);

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const items = await Promise.all(
        files.map(
          (file, idx) =>
            new Promise((resolve, reject) => {
              if (file.size > 5 * 1024 * 1024) {
                reject(new Error(`'${file.name}' exceeds 5MB limit.`));
                return;
              }
              const reader = new FileReader();
              reader.onload = (ev) =>
                resolve({
                  fileData: ev.target.result,
                  fileType: file.type || 'image/jpeg',
                  caption: `${apartment.unit_name} — ${file.name.replace(/\.[^/.]+$/, '')}`,
                  isPrimary: media.length === 0 && idx === 0,
                });
              reader.onerror = () => reject(new Error(`Failed reading ${file.name}`));
              reader.readAsDataURL(file);
            })
        )
      );

      await apartmentService.uploadMedia(apartment.id, items);
      addToast(`${items.length} apartment image(s) uploaded!`, 'success');
      await loadMedia();
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSetCover = async (mediaId) => {
    try {
      await apartmentService.setCoverMedia(apartment.id, mediaId);
      addToast('Primary apartment cover updated!', 'success');
      await loadMedia();
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to set cover image.', 'error');
    }
  };

  const handleMove = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setMedia(next);
    try {
      await apartmentService.reorderMedia(apartment.id, next.map((m) => m.id));
      addToast('Gallery order saved.', 'success');
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Reorder failed.', 'error');
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    try {
      await apartmentService.deleteMedia(apartment.id, mediaId);
      addToast('Image removed.', 'success');
      await loadMedia();
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Delete failed.', 'error');
    }
  };

  const handleSaveAmenities = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleaned = amenities.filter((a) => a.name.trim());
      await apartmentService.saveAmenities(apartment.id, cleaned);
      addToast('Apartment amenities saved!', 'success');
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to save amenities.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpecsAndVisibility = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanedCustom = (techSpecs.custom || []).filter((c) => c.label?.trim() && c.value?.trim());
      await apartmentService.update(apartment.id, {
        is_active: isActive ? 1 : 0,
        technical_specs: { ...techSpecs, custom: cleanedCustom },
      });
      addToast('Apartment specifications & visibility saved!', 'success');
      onUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to save specifications.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!apartment) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${apartment.unit_name} (#${apartment.unit_number}) — Media, Amenities & Specs`}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
          {[
            { id: 'MEDIA', label: `Gallery (${media.length})`, icon: <ImageIcon size={15} /> },
            { id: 'AMENITIES', label: `Amenities (${amenities.length})`, icon: <Sparkles size={15} /> },
            { id: 'SPECS', label: 'Specs & Visibility', icon: <ShieldCheck size={15} /> },
          ].map((t) => (
            <Button key={t.id} type="button" size="sm" variant={activeTab === t.id ? 'primary' : 'ghost'} onClick={() => setActiveTab(t.id)}>
              {t.icon} {t.label}
            </Button>
          ))}
        </div>

        {activeTab === 'MEDIA' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '1rem',
                borderRadius: '10px',
                border: '1.5px dashed rgba(212, 175, 55, 0.5)',
                cursor: uploading ? 'wait' : 'pointer',
                background: 'rgba(212, 175, 55, 0.06)',
                color: '#fbbf24',
                fontWeight: 700,
              }}
            >
              <Upload size={16} />
              <span>{uploading ? 'Uploading...' : 'Upload Apartment Photographs (JPEG, PNG, WebP · max 5 MB)'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFilesSelected} disabled={uploading} />
            </label>

            {loadingMedia ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Loading apartment media...</div>
            ) : media.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>No photographs uploaded for this unit yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
                {media.map((m, idx) => (
                  <div key={m.id} style={{ border: m.is_primary ? '2px solid #d4af37' : '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(0,0,0,0.35)' }}>
                    <div style={{ position: 'relative', aspectRatio: '16/10', background: '#0f172a' }}>
                      <img src={resolveMediaUrl(m.file_url)} alt={m.caption || apartment.unit_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {m.is_primary && (
                        <span style={{ position: 'absolute', top: '6px', left: '6px', background: '#d4af37', color: '#000', fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '9999px' }}>
                          PRIMARY COVER
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <Button type="button" size="sm" variant="ghost" disabled={idx === 0} onClick={() => handleMove(idx, -1)} title="Move earlier">
                          <ArrowUp size={13} />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={idx === media.length - 1} onClick={() => handleMove(idx, 1)} title="Move later">
                          <ArrowDown size={13} />
                        </Button>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {!m.is_primary && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => handleSetCover(m.id)} title="Set as main cover">
                            <Star size={13} />
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleDeleteMedia(m.id)} title="Delete photo">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'AMENITIES' && (
          <form onSubmit={handleSaveAmenities} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Manage unit-level amenities displayed publicly for this suite.</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAmenities([...amenities, { name: '', description: '' }])}>
                <Plus size={14} /> Add Amenity
              </Button>
            </div>
            {amenities.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Amenity (e.g. King Orthopaedic Bed)"
                  value={a.name}
                  onChange={(e) => {
                    const next = [...amenities];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setAmenities(next);
                  }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Details (optional)"
                  value={a.description}
                  onChange={(e) => {
                    const next = [...amenities];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setAmenities(next);
                  }}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setAmenities(amenities.filter((_, i) => i !== idx))}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Unit Amenities'}</Button>
            </div>
          </form>
        )}

        {activeTab === 'SPECS' && (
          <form onSubmit={handleSaveSpecsAndVisibility} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{ padding: '1rem 1.1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>Published on Public Website</span>
                <Badge variant={isActive ? 'success' : 'warning'}>{isActive ? 'PUBLISHED' : 'HIDDEN'}</Badge>
              </label>
            </div>

            <div style={{ padding: '1.1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#d4af37' }}>
                Suite Technical Specifications
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Room Configuration</label>
                  <input type="text" className="input-field" placeholder="e.g. Open Living Salon + Master Ensuite" value={techSpecs.room_configuration} onChange={(e) => setTechSpecs({ ...techSpecs, room_configuration: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Equipment &amp; Appliances</label>
                  <input type="text" className="input-field" placeholder="e.g. Induction Hob, Wine Chiller, Espresso Bar" value={techSpecs.equipment_appliances} onChange={(e) => setTechSpecs({ ...techSpecs, equipment_appliances: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Climate &amp; Acoustics</label>
                  <input type="text" className="input-field" placeholder="e.g. Multi-Zone Inverter AC, Soundproof Glazing" value={techSpecs.climate_control} onChange={(e) => setTechSpecs({ ...techSpecs, climate_control: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Entertainment &amp; Wi-Fi</label>
                  <input type="text" className="input-field" placeholder="e.g. 75-inch 4K Smart TV, Dedicated Wi-Fi 6 AP" value={techSpecs.connectivity_entertainment} onChange={(e) => setTechSpecs({ ...techSpecs, connectivity_entertainment: e.target.value })} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Specs & Visibility'}</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
