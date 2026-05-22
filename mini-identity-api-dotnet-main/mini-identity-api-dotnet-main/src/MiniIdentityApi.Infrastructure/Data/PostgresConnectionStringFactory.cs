using Npgsql;

namespace MiniIdentityApi.Infrastructure.Data;

public static class PostgresConnectionStringFactory
{
    public static string Create()
    {
        var host = Environment.GetEnvironmentVariable("DB_HOST") ?? "localhost";
        var port = Environment.GetEnvironmentVariable("DB_PORT") ?? "5432";
        var database = Environment.GetEnvironmentVariable("DB_NAME") ?? "catalog_db";
        var username = Environment.GetEnvironmentVariable("DB_USER") ?? "postgres";
        var password = Environment.GetEnvironmentVariable("DB_PASSWORD") ?? "postgres123";

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = host,
            Port = int.TryParse(port, out var parsedPort) ? parsedPort : 5432,
            Database = database,
            Username = username,
            Password = password,
            IncludeErrorDetail = true
        };

        if (RequiresSsl(Environment.GetEnvironmentVariable("DB_SSL")))
        {
            builder.SslMode = SslMode.Require;
        }

        return builder.ConnectionString;
    }

    private static bool RequiresSsl(string? value)
    {
        return value?.Trim().ToLowerInvariant() is "1" or "true" or "yes" or "require" or "required";
    }
}
