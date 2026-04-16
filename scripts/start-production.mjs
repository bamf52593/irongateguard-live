// Always force production mode — never allow a mis-set env var to override this.
process.env.NODE_ENV = 'production';

await import('../backend.js');
