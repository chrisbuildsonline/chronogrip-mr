import { type CubeTexture, CubeTextureLoader, LinearFilter, SRGBColorSpace } from 'three';

/** The rendered cubemaps (art/backdrops): c2 attic clock window, c1 clockmaker's atelier, c3 inside a giant movement. */
export type BackdropId = 'c1' | 'c2' | 'c3';

/** Face order of three's CubeTexture (the files are already flipped for its x convention). */
const FACES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];

/** The folder under public/, relative to the page: 1024 px faces for a phone, 2048 otherwise. */
export const backdropDir = (id: BackdropId, phone: boolean) => `backdrops/${id}_cube${phone ? '_1024' : ''}/`;

/** Loads one cubemap as an sRGB texture. */
export function loadBackdrop(id: BackdropId, phone: boolean): Promise<CubeTexture> {
  return new CubeTextureLoader().setPath(backdropDir(id, phone)).loadAsync(FACES).then((t) => {
    t.colorSpace = SRGBColorSpace;
    // The background is magnified or barely minified at every window size: mipmaps would only cost a third more memory.
    t.generateMipmaps = false;
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    return t;
  });
}
