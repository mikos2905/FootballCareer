import { GameProvider, useGame } from '../state';
import { Shell } from './components/Shell';
import { Creation } from './screens/Creation';
import { Draft } from './screens/Draft';
import { Season } from './screens/Season';
import { Decision } from './screens/Decision';
import { End } from './screens/End';

/** The screen state machine: creation -> draft -> season -> decision -> end. */
function Screens(): JSX.Element {
  const { screen } = useGame();
  switch (screen) {
    case 'creation':
      return <Creation />;
    case 'draft':
      return <Draft />;
    case 'season':
      return <Season />;
    case 'decision':
      return <Decision />;
    case 'end':
      return <End />;
    default:
      return <Creation />;
  }
}

function Layout(): JSX.Element {
  const { screen } = useGame();
  // Only the screens with a pinned action need clearance for it.
  return (
    <Shell hasBottomBar={screen === 'creation' || screen === 'season'}>
      <Screens />
    </Shell>
  );
}

export function App(): JSX.Element {
  return (
    <GameProvider>
      <Layout />
    </GameProvider>
  );
}
