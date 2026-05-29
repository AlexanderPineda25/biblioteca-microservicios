using Microsoft.Extensions.Options;

namespace MiniIdentityApi.Api.Factories;

public class CookieSettings
{
    public bool HttpOnly { get; set; } = true;
    public SameSiteMode SameSite { get; set; } = SameSiteMode.Lax;
    public int MaxAgeHours { get; set; } = 1;
    public bool Secure { get; set; } = true;
}

public interface ICookieOptionsFactory
{
    CookieOptions CreateAccessTokenCookie();
}

public class CookieOptionsFactory : ICookieOptionsFactory
{
    private readonly CookieSettings _settings;

    public CookieOptionsFactory(IOptions<CookieSettings> settings)
    {
        _settings = settings.Value;
    }

    public CookieOptions CreateAccessTokenCookie()
    {
        return new CookieOptions
        {
            HttpOnly = _settings.HttpOnly,
            Secure = _settings.Secure,
            SameSite = _settings.SameSite,
            MaxAge = TimeSpan.FromHours(_settings.MaxAgeHours)
        };
    }
}
