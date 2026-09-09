import request = require('supertest');

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';

describe('Facturify Docker smoke E2E', () => {
  it.each(['/api/v1/health', '/api/v1/health/live', '/api/v1/health/ready'])(
    'reports %s as healthy without leaking dependency details',
    async (path) => {
      const response = await request(apiUrl).get(path).expect(200);

      expect(Object.keys(response.body).sort()).toEqual(['status', 'timestamp']);
      expect(response.body.status).toBe('ok');
      expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    },
  );

  it('rejects an anonymous administrative request', async () => {
    const response = await request(apiUrl).get('/api/v1/companies').expect(401);

    expect(response.body.statusCode).toBe(401);
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejects an invalid integrator credential', async () => {
    const response = await request(apiUrl)
      .get('/api/v1/documents')
      .set('Authorization', 'Bearer fact_live_invalid')
      .expect(401);

    expect(response.body.statusCode).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain('fact_live_invalid');
  });

  it('does not expose Swagger in the production container', async () => {
    await request(apiUrl).get('/docs').expect(404);
  });
});
