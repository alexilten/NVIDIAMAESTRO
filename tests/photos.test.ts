import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_BY_ID } from '../src/core/catalog/products';
import { PHOTO_BY_ID } from '../src/core/catalog/photos';
import { SOURCE_BY_ID } from '../src/core/catalog/sources';

describe('product photos', () => {
  it('belong to catalog products, cite a source and ship their file', () => {
    expect(PHOTO_BY_ID.size).toBeGreaterThan(0);
    for (const [id, photo] of PHOTO_BY_ID) {
      expect(MODEL_BY_ID.get(id)?.image, id).toEqual(photo);
      expect(SOURCE_BY_ID.get(photo.sourceId), id).toBeTruthy();
      expect(existsSync(`public/${photo.src}`), photo.src).toBe(true);
    }
  });
});
