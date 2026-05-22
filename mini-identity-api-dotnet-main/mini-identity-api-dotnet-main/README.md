# MiniIdentity API

Servicio de autenticación e identidad.

## Endpoints

### AuthController
- `POST /api/auth/register`: Registra un nuevo usuario.
- `POST /api/auth/login`: Valida credenciales y retorna JWT.
- `POST /api/auth/introspect`: Verifica si un token es válido.

### UsersController
- `GET /api/users`: Retorna todos los usuarios (Admin).
- `GET /api/users/{id}`: Retorna un usuario por ID.
- `PATCH /api/users/{id}/activate`: Activa un usuario (Admin).
- `PATCH /api/users/{id}/deactivate`: Desactiva un usuario (Admin).
- `POST /api/users/{id}/roles`: Asigna un rol a un usuario (Admin).

### RolesController
- `GET /api/roles`: Retorna todos los roles (Admin).
- `POST /api/roles`: Crea un nuevo rol (Admin).
- `POST /api/roles/{roleName}/permissions`: Agrega un permiso a un rol (Admin).

### DemoController
- `GET /api/demo/profile`: Acceso para usuarios autenticados.
- `GET /api/demo/admin`: Acceso solo para Admin.

---
