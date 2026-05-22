namespace MiniIdentityApi.Domain.Entities;

public class Credential
{
    public string PasswordHash { get; private set; }
    public string Salt { get; private set; }
    public DateTime LastChangedAt { get; private set; }

    public Credential(string passwordHash, string salt)
    {
        PasswordHash = passwordHash;
        Salt = salt;
        LastChangedAt = DateTime.UtcNow;
    }

    public void ChangePassword(string newHash, string newSalt)
    {
        PasswordHash = newHash;
        Salt = newSalt;
        LastChangedAt = DateTime.UtcNow;
    }
}