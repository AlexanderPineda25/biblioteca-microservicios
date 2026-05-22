using Microsoft.Extensions.Configuration;
using MiniIdentityApi.Application.Interfaces;
using MiniIdentityApi.Domain.Entities;
using MiniIdentityApi.Infrastructure.Data;
using Npgsql;
using System.Reflection;

namespace MiniIdentityApi.Infrastructure.Repositories;

public class PostgresRoleRepository : IRoleRepository
{
    private readonly string _connectionString;

    public PostgresRoleRepository(IConfiguration configuration)
    {
        _connectionString = PostgresConnectionStringFactory.Create();
    }

    public Role? FindByName(string name)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand(
            "SELECT id, name FROM roles WHERE LOWER(name) = LOWER(@name)",
            connection);
        command.Parameters.AddWithValue("name", name.Trim());

        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;

        var roleId = reader.GetGuid(0);
        var roleName = reader.GetString(1);
        reader.Close();

        var role = new Role(roleName);
        var roleIdProp = typeof(Role).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
        roleIdProp?.SetValue(role, roleId);

        PopulateRolePermissions(role, connection);
        return role;
    }

    public List<Role> GetAll()
    {
        var roles = new List<Role>();
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        using var command = new NpgsqlCommand("SELECT id, name FROM roles", connection);

        using var reader = command.ExecuteReader();
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
            PopulateRolePermissions(role, connection);
        }

        return roles;
    }

    public void Save(Role role)
    {
        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            using var command = new NpgsqlCommand(
                @"INSERT INTO roles (id, name) VALUES (@id, @name)
                  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name",
                connection, transaction);
            command.Parameters.AddWithValue("id", role.Id);
            command.Parameters.AddWithValue("name", role.Name);
            command.ExecuteNonQuery();

            // Insert permissions and link them
            foreach (var permission in role.Permissions)
            {
                using var insertPermCmd = new NpgsqlCommand(
                    @"INSERT INTO permissions (id, code, description)
                      VALUES (@id, @code, @description)
                      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
                      RETURNING id",
                    connection, transaction);
                insertPermCmd.Parameters.AddWithValue("id", permission.Id);
                insertPermCmd.Parameters.AddWithValue("code", permission.Code);
                insertPermCmd.Parameters.AddWithValue("description", permission.Description ?? "");

                var actualPermId = insertPermCmd.ExecuteScalar();
                if (actualPermId != null && actualPermId != DBNull.Value)
                {
                    var actualGuid = (Guid)actualPermId;
                    var idProp = typeof(Permission).GetProperty("Id", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
                    idProp?.SetValue(permission, actualGuid);
                }

                using var linkCmd = new NpgsqlCommand(
                    @"INSERT INTO role_permissions (role_id, permission_id)
                      VALUES (@role_id, @permission_id)
                      ON CONFLICT DO NOTHING",
                    connection, transaction);
                linkCmd.Parameters.AddWithValue("role_id", role.Id);
                linkCmd.Parameters.AddWithValue("permission_id", permission.Id);
                linkCmd.ExecuteNonQuery();
            }

            transaction.Commit();
        }
        catch
        {
            transaction.Rollback();
            throw;
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
