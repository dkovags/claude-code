import { describe, expect, it } from "vitest";
import { normalizeName, pickPreview, sameArtist, searchUrl } from "../../src/post-pronto/preview";

const track = (trackName: string, artistName: string, previewUrl = `https://audio.teste/${trackName}.m4a`) => ({
  trackName,
  artistName,
  previewUrl,
  artworkUrl100: "https://capa.teste/100x100.jpg",
  trackViewUrl: "https://music.apple.com/br/song/1",
});

describe("trecho da música", () => {
  it("compara nomes sem acentos, pontuação nem maiúsculas", () => {
    expect(normalizeName("Aquarela (Ao Vivo)")).toBe("aquarela ao vivo");
    expect(normalizeName("Antônio Carlos Jobim")).toBe("antonio carlos jobim");
    expect(normalizeName("  Legião Urbana!  ")).toBe("legiao urbana");
  });

  it("reconhece o mesmo artista com outro nome ou em parceria", () => {
    expect(sameArtist("Tom Jobim", "Antônio Carlos Jobim")).toBe(true);
    expect(sameArtist("Marisa Monte", "Marisa Monte, Carlinhos Brown & Arnaldo Antunes")).toBe(true);
    expect(sameArtist("Legião Urbana", "Legiao Urbana")).toBe(true);
    expect(sameArtist("Pharrell Williams", "Robbie Williams")).toBe(true); // sobrenome em comum: o título decide
    expect(sameArtist("Toquinho", "Vinicius de Moraes")).toBe(false);
    expect(sameArtist("", "Qualquer")).toBe(true);
  });

  it("escolhe a faixa do artista sugerido com o título mais parecido", () => {
    const results = [
      track("Aquarela", "Outro Artista"),
      track("Aquarela (Ao Vivo)", "Toquinho"),
      track("Aquarela", "Toquinho"),
    ];
    const p = pickPreview(results, "Aquarela", "Toquinho");
    expect(p).toEqual({
      audio: "https://audio.teste/Aquarela.m4a",
      title: "Aquarela",
      artist: "Toquinho",
      artwork: "https://capa.teste/100x100.jpg",
      link: "https://music.apple.com/br/song/1",
    });
    expect(pickPreview([track("Aquarela (Ao Vivo)", "Toquinho")], "Aquarela", "Toquinho")?.title).toBe("Aquarela (Ao Vivo)");
  });

  it("não toca outra música no lugar", () => {
    expect(pickPreview([track("Happy", "Outro Artista")], "Happy", "Pharrell Williams")).toBeNull();
    expect(pickPreview([track("Freedom", "Pharrell Williams")], "Happy", "Pharrell Williams")).toBeNull();
    expect(pickPreview([track("Happy", "Pharrell Williams", "")], "Happy", "Pharrell Williams")).toBeNull();
    expect(pickPreview([null, "x", 3], "Happy", "Pharrell Williams")).toBeNull();
    expect(pickPreview([], "Happy", "Pharrell Williams")).toBeNull();
  });

  it("busca músicas na loja brasileira", () => {
    const url = new URL(searchUrl("Wave", "Tom Jobim", "cb"));
    expect(url.origin + url.pathname).toBe("https://itunes.apple.com/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      term: "Wave Tom Jobim",
      media: "music",
      entity: "song",
      limit: "10",
      country: "BR",
      callback: "cb",
    });
  });
});
