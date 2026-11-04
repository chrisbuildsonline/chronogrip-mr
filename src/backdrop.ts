import { SRGBColorSpace, type Texture, TextureLoader } from 'three';

/** The rendered panoramas (art/backdrops): c2 attic clock window, c1 clockmaker's atelier, c3 inside a giant movement. */
export type BackdropId = 'c1' | 'c2' | 'c3';

/** The file under public/, relative to the page: 2048 wide for a phone, 4096 otherwise. */
export const backdropFile = (id: BackdropId, phone: boolean) => `backdrops/${id}_pano${phone ? '_2048' : ''}.jpg`;

/** Loads one panorama as an sRGB texture (the mapping is set where it becomes the background). */
export function loadBackdrop(id: BackdropId, phone: boolean): Promise<Texture> {
  return new TextureLoader().loadAsync(backdropFile(id, phone)).then((t) => {
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}
