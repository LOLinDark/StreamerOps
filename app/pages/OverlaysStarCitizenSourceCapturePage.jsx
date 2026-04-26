import OverlaysStarCitizenQuickPlayoutPage from './OverlaysStarCitizenQuickPlayoutPage';

export default function OverlaysStarCitizenSourceCapturePage() {
  return (
    <OverlaysStarCitizenQuickPlayoutPage
      defaultOutputMode="overlay"
      defaultMediaFitMode="contain"
      lockVisibilityToggles
      lockStageMode
      sourceCaptureMode
      defaultCanvasWidth={1080}
      defaultCanvasHeight={600}
    />
  );
}
