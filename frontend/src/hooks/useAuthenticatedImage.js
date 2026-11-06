import { useState, useEffect, useRef, useCallback } from 'react';
import { maintenanceService } from '../services/api';

/**
 * useAuthenticatedImage Hook
 *
 * Securely streams private maintenance evidence images via Bearer-authenticated
 * API calls, creating and managing local object URLs (Blob URLs).
 *
 * Security & Reliability guarantees:
 * - Never appends auth tokens to query params (Bearer header via axios instance).
 * - Never exposes local disk filesystem paths.
 * - Automatically revokes Blob URLs on cleanup/unmount to prevent browser memory leaks.
 * - Guards against race conditions and stale responses on unmounted components.
 * - Supports manual retry on transient failures.
 */
export function useAuthenticatedImage(workOrderId, evidenceId) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const currentBlobUrlRef = useRef(null);
  const abortControllerRef = useRef(null);

  const revokeCurrentBlob = useCallback(() => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  const fetchImage = useCallback(async () => {
    if (!workOrderId || !evidenceId) {
      revokeCurrentBlob();
      setImageUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Cancel any ongoing fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const blob = await maintenanceService.streamEvidence(workOrderId, evidenceId);

      if (controller.signal.aborted) return;

      if (!blob || !(blob instanceof Blob)) {
        throw new Error('Invalid image stream payload received.');
      }

      // Check if blob is actually an error payload (e.g. application/json in blob)
      if (blob.type === 'application/json') {
        const text = await blob.text();
        let errMsg = 'Failed to load private image evidence.';
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.error?.message || parsed.message || errMsg;
        } catch {
          // ignore json parse error
        }
        throw new Error(errMsg);
      }

      revokeCurrentBlob();
      const objectUrl = URL.createObjectURL(blob);
      currentBlobUrlRef.current = objectUrl;
      setImageUrl(objectUrl);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn(`[useAuthenticatedImage] Failed to stream evidence #${evidenceId}:`, err.message || err);
      revokeCurrentBlob();
      setImageUrl(null);
      setError(err.message || 'Unable to load evidence image.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [workOrderId, evidenceId, revokeCurrentBlob]);

  useEffect(() => {
    fetchImage();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      revokeCurrentBlob();
    };
  }, [fetchImage, revokeCurrentBlob]);

  return {
    imageUrl,
    loading,
    error,
    retry: fetchImage,
  };
}

export default useAuthenticatedImage;

