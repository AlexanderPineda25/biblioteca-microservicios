using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Application.Services;
using MiniIdentityApi.Domain.Entities;
using MiniIdentityApi.Infrastructure.Data;
using MiniIdentityApi.Infrastructure.Repositories;
using MiniIdentityApi.Infrastructure.Security;
using System.Text;
using System.Reflection;
using MiniIdentityApi.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "MiniIdentity API",
        Version = "v1"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Please enter a valid token.",
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        BearerFormat = "JWT",
        Scheme = "bearer"
    });

    options.AddSecurityRequirement(document => new()
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

builder.Services.AddSingleton<IUserRepository, PostgresUserRepository>();
builder.Services.AddSingleton<IRoleRepository, PostgresRoleRepository>();
builder.Services.AddSingleton<IPasswordHasher, Sha256PasswordHasher>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();

builder.Services.AddScoped<AuthenticationService>();
builder.Services.AddScoped<AuthorizationService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<RoleService>();

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key is missing in configuration.");

var jwtIssuer = builder.Configuration["Jwt:Issuer"]
    ?? throw new InvalidOperationException("Jwt:Issuer is missing in configuration.");

var jwtAudience = builder.Configuration["Jwt:Audience"]
    ?? throw new InvalidOperationException("Jwt:Audience is missing in configuration.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        var corsOrigins = (builder.Configuration["CORS_ORIGINS"] ?? "http://localhost:4173")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        policy
            .WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// Ensure PostgreSQL is available and tables exist
var connectionString = PostgresConnectionStringFactory.Create();

Console.WriteLine("Waiting for PostgreSQL connection and initializing schema...");
for (int i = 0; i < 20; i++)
{
    try
    {
        using var connection = new Npgsql.NpgsqlConnection(connectionString);
        connection.Open();
        
        using var cmd = new Npgsql.NpgsqlCommand(@"
            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL
            );

            CREATE TABLE IF NOT EXISTS permissions (
                id UUID PRIMARY KEY,
                code VARCHAR(255) UNIQUE NOT NULL,
                description VARCHAR(255) NULL
            );

            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            );

            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                status VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                password_salt VARCHAR(255) NOT NULL,
                last_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_roles (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, role_id)
            );
        ", connection);
        cmd.ExecuteNonQuery();
        Console.WriteLine("✓ PostgreSQL database connection and schema initialized.");
        break;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Postgres Wait] Attempt {i + 1} failed: {ex.Message}");
        System.Threading.Thread.Sleep(2000);
    }
}

var userRepository = app.Services.GetRequiredService<IUserRepository>();
var roleRepository = app.Services.GetRequiredService<IRoleRepository>();
var passwordHasher = app.Services.GetRequiredService<IPasswordHasher>();

var adminRole = roleRepository.FindByName("Admin");
if (adminRole is null)
{
    adminRole = new Role("Admin");
    adminRole.AddPermission(new Permission("users.read", "Can read users"));
    adminRole.AddPermission(new Permission("users.manage", "Can manage users"));
    adminRole.AddPermission(new Permission("roles.read", "Can read roles"));
    adminRole.AddPermission(new Permission("roles.manage", "Can manage roles"));

    roleRepository.Save(adminRole);
}

var adminUser = userRepository.FindByUsernameOrEmail("admin");
if (adminUser is null)
{
    var salt = passwordHasher.GenerateSalt();
    var hash = passwordHasher.Hash("admin", salt);

    var credential = new Credential(hash, salt);
    adminUser = new User("admin", "admin@example.com", credential);
    adminUser.AddRole(adminRole);

    userRepository.Save(adminUser);
}
else
{
    // Update password to 'admin' in case it was set to something else
    var salt = passwordHasher.GenerateSalt();
    var hash = passwordHasher.Hash("admin", salt);
    
    var idProp = typeof(User).GetProperty("Credential", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
    idProp?.SetValue(adminUser, new Credential(hash, salt));
    userRepository.Save(adminUser);
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseCorrelationId();

app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new
{
    success = true,
    service = "identity-service",
    timestamp = DateTime.UtcNow
}));
app.MapControllers();

app.Run();
