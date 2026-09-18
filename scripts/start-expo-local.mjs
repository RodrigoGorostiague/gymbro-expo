import { execFileSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function readLanAddress() {
  const addresses = Object.entries(networkInterfaces())
    .flatMap(([name, networks]) => (networks ?? []).map((network) => ({ name, ...network })))
    .filter((network) => network?.family === 'IPv4'
      && !network.internal
      && !network.address.startsWith('169.254.'));
  const address = addresses.find((network) => !/^(docker|br-|veth)/.test(network.name ?? ''))?.address;

  if (!address) {
    throw new Error('No se encontró una IP IPv4 de red local. Define SUPABASE_LOCAL_URL manualmente.');
  }
  return address;
}

const apiUrl = process.env.SUPABASE_LOCAL_URL ?? `http://${readLanAddress()}:54321`;

function readLocalAnonKey() {
  let status;
  try {
    status = execFileSync('npx', ['--yes', 'supabase@latest', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('No se pudo leer el estado de Supabase local. Iniciá Docker y la pila local.');
  }

  const localKey = status.match(/^(?:ANON_KEY|PUBLISHABLE_KEY)=(.+)$/m)?.[1]?.trim();
  if (!localKey) {
    throw new Error('No se encontró la anon key de Supabase local.');
  }
  return localKey.replace(/^['"]|['"]$/g, '');
}

try {
  const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_SUPABASE_URL: apiUrl,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: readLocalAnonKey(),
    },
  });
  child.on('exit', (code) => process.exit(code ?? 1));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar Expo con Supabase local.');
  process.exit(1);
}
