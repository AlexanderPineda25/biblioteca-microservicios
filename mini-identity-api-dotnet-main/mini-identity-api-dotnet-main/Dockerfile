# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj files and restore dependencies
COPY ["src/MiniIdentityApi.Api/MiniIdentityApi.Api.csproj", "src/MiniIdentityApi.Api/"]
COPY ["src/MiniIdentityApi.Application/MiniIdentityApi.Application.csproj", "src/MiniIdentityApi.Application/"]
COPY ["src/MiniIdentityApi.Domain/MiniIdentityApi.Domain.csproj", "src/MiniIdentityApi.Domain/"]
COPY ["src/MiniIdentityApi.Infrastructure/MiniIdentityApi.Infrastructure.csproj", "src/MiniIdentityApi.Infrastructure/"]
COPY ["src/MiniIdentityApi.Tests/MiniIdentityApi.Tests.csproj", "src/MiniIdentityApi.Tests/"]

RUN dotnet restore "src/MiniIdentityApi.Api/MiniIdentityApi.Api.csproj"

# Copy everything else and build
COPY . .
WORKDIR "/src/src/MiniIdentityApi.Api"
RUN dotnet build "MiniIdentityApi.Api.csproj" -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish "MiniIdentityApi.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .
EXPOSE 5132
ENV ASPNETCORE_URLS=http://+:5132
ENTRYPOINT ["dotnet", "MiniIdentityApi.Api.dll"]