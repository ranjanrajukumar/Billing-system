function parseConnectionString(value = '') {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((settings, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return settings;

      const key = part.slice(0, separator).trim().toLowerCase();
      const settingValue = part.slice(separator + 1).trim();
      settings[key] = settingValue;
      return settings;
    }, {});
}

function parseDatabaseUrl(value = '') {
  if (!value) return {};

  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.replace(':', '');
    const dialect = protocol === 'mysql2' ? 'mysql' : protocol;

    return {
      dialect,
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: parsed.pathname.replace(/^\//, ''),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || '')
    };
  } catch {
    return {};
  }
}

function isTrue(value) {
  return String(value || '').toLowerCase() === 'true';
}

function normalizeServerName(server = '') {
  return server.replaceAll('\\\\', '\\');
}

function splitServer(server = '') {
  const normalized = normalizeServerName(server);
  const [host, instance] = normalized.split('\\');
  return { host, instance };
}

export function getDbSettings() {
  const connection = parseConnectionString(process.env.DB_CONNECTION_STRING);
  const databaseUrl = parseDatabaseUrl(process.env.DATABASE_MYSQLURL || process.env.DATABASE_URL);
  const server = connection.server || connection['data source'];
  const parsedServer = splitServer(server);
  const trustedConnection = isTrue(connection.trusted_connection) || isTrue(connection.integratedsecurity);
  const trustServerCertificate = connection.trustservercertificate ?? process.env.DB_TRUST_SERVER_CERTIFICATE;
  const database = connection.database || connection['initial catalog'];

  return {
    dialect: process.env.DB_DIALECT || databaseUrl.dialect || 'mysql',
    host: process.env.DB_HOST || parsedServer.host || databaseUrl.host || 'localhost',
    instance: process.env.DB_INSTANCE || parsedServer.instance || '',
    port: Number(process.env.DB_PORT || databaseUrl.port || 1433),
    database: process.env.DB_NAME || database || databaseUrl.database || 'billing_system',
    user: process.env.DB_USER || databaseUrl.user || 'root',
    password: process.env.DB_PASSWORD || databaseUrl.password || '',
    authType: process.env.DB_AUTH_TYPE || (trustedConnection ? 'trusted' : 'default'),
    domain: process.env.DB_DOMAIN || '',
    encrypt: isTrue(process.env.DB_ENCRYPT),
    trustServerCertificate: trustServerCertificate === undefined ? true : isTrue(trustServerCertificate),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 30000),
    requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT || 30000)
  };
}

// export function getConnectionOptions({ databaseLogging = false } = {}) {
//   const settings = getDbSettings();
//   const options = {
//     host: settings.host,
//     dialect: settings.dialect,
//     logging: databaseLogging
//   };

//   if (settings.dialect !== 'mssql') {
//     options.port = settings.port || 3306;
//     return options;
//   }

//   options.dialectOptions = {
//     options: {
//       encrypt: settings.encrypt,
//       trustServerCertificate: settings.trustServerCertificate,
//       connectTimeout: settings.connectTimeout,
//       requestTimeout: settings.requestTimeout
//     }
//   };

//   if (settings.instance) {
//     options.dialectOptions.options.instanceName = settings.instance;
//   } else {
//     options.port = settings.port;
//   }

//   if (settings.authType === 'ntlm') {
//     options.dialectOptions.authentication = {
//       type: 'ntlm',
//       options: {
//         domain: settings.domain,
//         userName: settings.user,
//         password: settings.password
//       }
//     };
//   }

//   return options;
// }


export function getConnectionOptions({ databaseLogging = false } = {}) {
  const settings = getDbSettings();

  const options = {
    host: settings.host,
    dialect: settings.dialect,
    logging: databaseLogging,

    // Keep the connection pool very small for FreeDB
    pool: {
      max: 1,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  if (settings.dialect !== 'mssql') {
    options.port = settings.port || 3306;
    return options;
  }

  options.dialectOptions = {
    options: {
      encrypt: settings.encrypt,
      trustServerCertificate: settings.trustServerCertificate,
      connectTimeout: settings.connectTimeout,
      requestTimeout: settings.requestTimeout
    }
  };

  if (settings.instance) {
    options.dialectOptions.options.instanceName = settings.instance;
  } else {
    options.port = settings.port;
  }

  if (settings.authType === 'ntlm') {
    options.dialectOptions.authentication = {
      type: 'ntlm',
      options: {
        domain: settings.domain,
        userName: settings.user,
        password: settings.password
      }
    };
  }

  return options;
}

export function assertSupportedAuth() {
  const settings = getDbSettings();

  if (settings.dialect !== 'mssql' || settings.authType !== 'trusted') {
    return;
  }

  throw new Error(
    'Trusted_Connection=True is a Windows/SSMS connection mode. The Sequelize SQL Server driver used here needs SQL authentication (DB_USER/DB_PASSWORD) or DB_AUTH_TYPE=ntlm with a Windows username and password.'
  );
}
