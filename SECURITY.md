# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **DO NOT** open a public issue
2. Email: marmiksoni777@gmail.com
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You should receive a response within 48 hours. We will investigate and patch critical vulnerabilities as quickly as possible.

## Security Best Practices

When deploying PushFlow:

- Never commit `.env` files with real credentials
- Use environment variables for sensitive data
- Enable HTTPS in production
- Configure MongoDB network access restrictions
- Rotate VAPID keys if compromised
- Keep dependencies updated: `pnpm update`
- Review rate limiting settings for your use case
