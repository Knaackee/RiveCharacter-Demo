export async function runDataProbe(rive, status, canvas, previous) {
  status.textContent = 'Probe wird geladen …';
  previous?.runtime.cleanup();
  previous?.image.unref?.();
  try {
    const [manifestResponse, rivResponse, imageResponse] = await Promise.all([
      fetch('./probe/manifest.json', { cache: 'no-store' }),
      fetch('./probe/data-probe.riv', { cache: 'no-store' }),
      fetch('./probe/person-color.png', { cache: 'no-store' }),
    ]);
    if (![manifestResponse, rivResponse, imageResponse].every((response) => response.ok)) throw new Error('Probe-Dateien sind unvollständig.');
    const definition = (await manifestResponse.json()).dataProbe;
    if (!definition?.viewModel || !definition?.imageProperty) throw new Error('Data-Probe-Vertrag fehlt im Manifest.');
    const [buffer, imageBytes] = await Promise.all([rivResponse.arrayBuffer(), imageResponse.arrayBuffer()]);
    const image = await rive.decodeImage(new Uint8Array(imageBytes));
    let runtime;
    const result = await new Promise((resolve, reject) => {
      runtime = new rive.Rive({
        buffer, canvas, autoplay: true, autoBind: false,
        layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
        onLoadError: () => reject(new Error('data-probe.riv konnte nicht geladen werden.')),
        onLoad: () => {
          try {
            const model = runtime.viewModelByName(definition.viewModel);
            const instance = model?.defaultInstance() ?? model?.instanceByName('Default');
            if (!instance) throw new Error(`ViewModel ${definition.viewModel} hat keine Default-Instanz.`);
            runtime.bindViewModelInstance(instance);
            const imageProperty = instance.image(definition.imageProperty);
            const list = instance.list(definition.listProperty);
            if (!imageProperty || !list) throw new Error('Foto- oder Listenfeld fehlt in der Runtime.');
            imageProperty.value = image;
            const before = list.length;
            const removed = list.instanceAt(before - 1);
            list.removeInstanceAt(before - 1);
            const afterRemove = list.length;
            if (removed) list.addInstance(removed);
            runtime.resizeDrawingSurfaceToCanvas();
            resolve({ before, afterRemove, afterRestore: list.length });
          } catch (error) { reject(error); }
        },
      });
    });
    status.textContent = `Browsernachweis: Foto dekodiert und gebunden · Liste ${result.before} → ${result.afterRemove} → ${result.afterRestore}.`;
    return { runtime, image };
  } catch (error) {
    status.textContent = `Probe fehlgeschlagen: ${error.message}`;
    return null;
  }
}
