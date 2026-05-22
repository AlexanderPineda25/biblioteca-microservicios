using Microsoft.Extensions.Configuration;
using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Domain.Entities;
using MiniIdentityApi.Domain.Enums;
using Npgsql;
using System.Reflection;

namespace MiniIdentityApi.Infrastructure.Repositories;

public class PostgresUserRepository : IUserRepository
{
    private readonly string _connectionString;

    public PostgresUserRepository(IConfiguration configuration)
    {
        var host = Environment.GetEnvironmentVariable("DB_HOST") ?? "localhost";
        var port = Environment.GetEnvironmentVariable("DB_PORT") ?? "5432";
        var database = Environment.GetEnvironmentVariable("DB_NAME") ?? "catalog_db";
        var username = Environment.GetEnvironmentVariable("DB_USER") ?? "postgres";
        var password = Environment.GetEnvironmentVariable("DB_PASSWORD") ?? "postgres123";

        _connectionString = $"Host={host};Port={port};Database={database};Username={username};Password={password};Include Error Detail=true";
    }

    public User? FindById(Guid id)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "SELECT id, username, email, status, password_hash, password_salt FROM users WHERE id = @id",
            connection);
        command.Parameters.AddWithValue("id", id);

        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;

        var user = MapUserFromReader(reader);
        reader.Close();

        PopulateUserRoles(user, connection);
        return user;
    }

    public User? FindByUsernameOrEmail(string value)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "SELECT id, username, email, status, password_hash, password_salt FROM users WHERE LOWER(username) = LOWER(@val) OR LOWER(email) = LOWER(@val)",
            connection);
        command.Parameters.AddWithValue("val", value.Trim());

        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;

        var user = MapUserFromReader(reader);
        reader.Close();

        PopulateUserRoles(user, connection);
        return user;
    }

    public List<User> GetAll()
    {
        var users = new List<User>();
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "SELECT id, username, email, status, password_hash, password_salt FROM users",
            connection);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            users.Add(MapUserFromReader(reader));
        }
        reader.Close();

        foreach (var user in users)
        {
            PopulateUserRoles(user, connection);
        }

        return users;
    }

    public void Save(User user)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            using var command = new NpgsqlCommand(
                @"INSERT INTO users (id, username, email, status, password_hash, password_salt, last_changed_at)
                  VALUES (@id, @username, @email, @status, @password_hash, @password_salt, @last_changed)
                  ON CONFLICT (id) DO UPDATE SET
                      username = EXCLUDED.username,
                      email = EXCLUDED.email,
                      status = EXCLUDED.status,
                      password_hash = EXCLUDED.password_hash,
                      password_salt = EXCLUDED.password_salt,
                      last_changed_at = EXCLUDED.last_changed_at",
                connection, transaction);

            command.Parameters.AddWithValue("id", user.Id);
            command.Parameters.AddWithValue("username", user.Username);
            command.Parameters.AddWithValue("email", user.Email);
            command.Parameters.AddWithValue("status", user.Status.ToString());
            command.Parameters.AddWithValue("password_hash", user.Credential.PasswordHash);
            command.Parameters.AddWithValue("password_salt", user.Credential.Salt);
            command.Parameters.AddWithValue("last_changed", user.Credential.LastChangedAt);

            command.ExecuteNonQuery();

            // Sync user roles
            using var deleteRolesCmd = new NpgsqlCommand("DELETE FROM user_roles WHERE user_id = @user_id", connection, transaction);
            deleteRolesCmd.Parameters.AddWithValue("user_id", user.Id);
            deleteRolesCmd.ExecuteNonQuery();

            foreach (var role in user.Roles)
            {
                using var insertRoleCmd = new NpgsqlCommand(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (@user_id, @role_id) ON CONFLICT DO NOTHING",
                    connection, transaction);
                insertRoleCmd.Parameters.AddWithValue("user_id", user.Id);
                insertRoleCmd.Parameters.AddWithValue("role_id", role.Id);
                insertRoleCmd.ExecuteNonQuery();
            }

            transaction.Commit();
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    private User MapUserFromReader(NpgsqlDataReader reader)
    {
        var id = reader.GetGuid(0);
        var username = reader.GetString(1);
        var email = reader.GetString(2);
        var statusStr = reader.GetString(3);
        var passwordHash = reader.GetString(4);
        var passwordSalt = reader.GetString(5);

        var status = Enum.Parse<UserStatus>(statusStr, true);
        var credential = new Credential(passwordHash, passwordSalt);
        var user = new User(username, email, credential);

        // Map private properties using reflection
        var idProp = typeof(User).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
        idProp?.SetValue(user, id);

        var statusProp = typeof(User).GetProperty("Status", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
        statusProp?.SetValue(user, status);

        return user;
    }

    private void PopulateUserRoles(User user, NpgsqlConnection connection)
    {
        using var command = new NpgsqlCommand(
            @"SELECT r.id, r.name FROM roles r
              INNER JOIN user_roles ur ON ur.role_id = r.id
              WHERE ur.user_id = @user_id",
            connection);
        command.Parameters.AddWithValue("user_id", user.Id);

        using var reader = command.ExecuteReader();
        var roles = new List<Role>();
        while (reader.Read())
        {
            var roleId = reader.GetGuid(0);
            var roleName = reader.GetString(1);
            var role = new Role(roleName);

            var roleIdProp = typeof(Role).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
            roleIdProp?.SetValue(role, roleId);

            roles.Add(role);
        }
        reader.Close();

        foreach (var role in roles)
        {
            // Populate permissions for each role
            PopulateRolePermissions(role, connection);
            user.AddRole(role);
        }
    }

    private void PopulateRolePermissions(Role role, NpgsqlConnection connection)
    {
        using var command = new NpgsqlCommand(
            @"SELECT p.id, p.code, p.description FROM permissions p
              INNER JOIN role_permissions rp ON rp.permission_id = p.id
              WHERE rp.role_id = @role_id",
            connection);
        command.Parameters.AddWithValue("role_id", role.Id);

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var permId = reader.GetGuid(0);
            var permCode = reader.GetString(1);
            var permDesc = reader.IsDBNull(2) ? "" : reader.GetString(2);
            var permission = new Permission(permCode, permDesc);

            var permIdProp = typeof(Permission).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
            permIdProp?.SetValue(permission, permId);

            role.AddPermission(permission);
        }
        reader.Close();
    }
}
